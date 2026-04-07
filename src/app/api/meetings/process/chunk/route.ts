import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { streamMeetingWithGemini } from '@/lib/gemini';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const { userId } = await import('@clerk/nextjs/server').then(m => m.auth());
    const formData = await request.formData();
    const audioBlob = formData.get('audio') as File | null;
    const meetingIdInput = formData.get('meetingId') as string | null;
    const title = formData.get('title') as string || "Live Meeting Recording";
    const mimeType = formData.get('mimeType') as string || "audio/webm";
    const timeOffset = parseInt((formData.get('timeOffset') as string) || "0", 10);

    if (!audioBlob) {
      return NextResponse.json({ error: "No audio provided in chunk" }, { status: 400 });
    }

    let meeting;
    if (meetingIdInput) {
      meeting = await prisma.meeting.findUnique({ where: { id: meetingIdInput } });
      if (!meeting) {
        return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
      }
      // CRITICAL SECURITY FIX: Prevent attackers from injecting audio into other users' meetings
      if (meeting.userId && meeting.userId !== userId) {
        return NextResponse.json({ error: "Forbidden: You do not own this meeting." }, { status: 403 });
      }
    } else {
      meeting = await prisma.meeting.create({
        data: { 
          title: title, 
          status: "PROCESSING",
          userId: userId || null 
        }
      });
    }

    const buffer = Buffer.from(await audioBlob.arrayBuffer());
    // Create uniquely uncollidable tmp paths for simultaneous chunk handling
    const ext = audioBlob.name ? path.extname(audioBlob.name) : '.webm';
    const tmpPath = path.join(os.tmpdir(), `${meeting.id}_chunk_${Date.now()}_${Math.random()}${ext}`);
    fs.writeFileSync(tmpPath, buffer);

    let accumulatedJson = "";
    try {
      for await (const chunk of streamMeetingWithGemini(tmpPath, mimeType)) {
         accumulatedJson += chunk;
      }
    } catch (e) {
      console.error("Chunk Stream generation failed natively:", e);
    }
    
    try { fs.unlinkSync(tmpPath); } catch (e) {}

    // Extract valid segments regardless of stream failures
    let validSegments: any[] = [];
    const segmentMatches = accumulatedJson.match(/\{\s*"speakerLabel"[\s\S]*?\}/g);
    if (segmentMatches) {
      validSegments = segmentMatches.map(m => {
        try { return JSON.parse(m); } catch(e) { return null; }
      }).filter(Boolean);
    }
    
    for (let i = 0; i < validSegments.length; i++) {
      const s = validSegments[i];
      await prisma.transcriptSegment.create({
        data: {
          meetingId: meeting.id,
          speakerLabel: s.speakerLabel || `Speaker 1`,
          startTime: (s.startTime || (i * 5.0)) + timeOffset,
          endTime: (s.endTime || (i * 5.0 + 5.0)) + timeOffset,
          originalText: s.originalText,
          detectedLanguage: s.detectedLanguage || "English",
          translatedTextEn: s.translatedTextEn,
          codeSwitchFlag: s.codeSwitchFlag || false
        }
      });
    }

    return NextResponse.json({ success: true, meetingId: meeting.id });

  } catch (error) {
    console.error("Chunk processor crashed:", error);
    return NextResponse.json({ error: "Failed to process audio chunk natively" }, { status: 500 });
  }
}
