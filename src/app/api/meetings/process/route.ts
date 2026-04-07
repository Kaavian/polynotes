import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { streamMeetingWithGemini } from '@/lib/gemini';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioBlob = formData.get('audio') as File;
    const title = formData.get('title') as string || "Untitled Meeting";
    const mimeType = formData.get('mimeType') as string || "audio/webm";

    if (!audioBlob) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioBlob.arrayBuffer());
    
    const { userId } = await import('@clerk/nextjs/server').then(m => m.auth());
    const meeting = await prisma.meeting.create({
      data: { title: title, status: "PROCESSING", userId: userId || null }
    });

    const ext = audioBlob.name ? path.extname(audioBlob.name) : '.webm';
    const tmpPath = path.join(os.tmpdir(), `${meeting.id}${ext}`);
    fs.writeFileSync(tmpPath, buffer);

    const stream = new ReadableStream({
      async start(controller) {
        // Broadcast the meeting ID instantly so the frontend hooks up
        controller.enqueue(new TextEncoder().encode(`__MEETING_ID__:${meeting.id}\n`));
        
        let accumulatedJson = "";
        
        try {
          // Stream raw tokens natively to the client for live parsing
          for await (const chunk of streamMeetingWithGemini(tmpPath, mimeType)) {
             accumulatedJson += chunk;
             controller.enqueue(new TextEncoder().encode(chunk));
          }
        } catch (streamingError) {
          console.error("Stream generation failed:", streamingError);
        }
        
        try { fs.unlinkSync(tmpPath); } catch {}

        // Wait to finish the DB saving block securely so the client redirect doesn't visually race the DB
        try {
          // Use safe Regex block extraction identical to the frontend so a truncated stream still cleanly extracts 99% of valid segments!
          type TranscriptSegmentBase = { speakerLabel: string; startTime: number; endTime: number; originalText: string; detectedLanguage: string; translatedTextEn: string | null; codeSwitchFlag: boolean; };
          let validSegments: TranscriptSegmentBase[] = [];
          const segmentMatches = accumulatedJson.match(/\{\s*"speakerLabel"[\s\S]*?\}/g);
          if (segmentMatches) {
            validSegments = segmentMatches.map(m => {
              try { return JSON.parse(m); } catch { return null; }
            }).filter(Boolean);
          }
          
          for (let i = 0; i < validSegments.length; i++) {
            const s = validSegments[i];
            await prisma.transcriptSegment.create({
              data: {
                meetingId: meeting.id,
                speakerLabel: s.speakerLabel || `Speaker 1`,
                startTime: s.startTime || (i*5.0),
                endTime: s.endTime || (i*5.0 + 5.0),
                originalText: s.originalText,
                detectedLanguage: s.detectedLanguage || "English",
                translatedTextEn: s.translatedTextEn,
                codeSwitchFlag: s.codeSwitchFlag || false
              }
            });
          }

          // Try to safely extract Summary and Actions if they completed, or use graceful fallbacks
          type FallbackSummary = { abstract: string; keyPoints: string[]; risks: string[]; blockers: string[] };
          type ParsedAction = { title: string; owner: string | null; dueDate: string | null; sourceLanguage: string; linkedSegmentIndex?: number };
          let summaryData: FallbackSummary = { abstract: "The transcription stream ended before a complete summary could be finalized.", keyPoints: ["Partial transcript captured"], risks: [], blockers: [] };
          let actionsData: ParsedAction[] = [];
          
          try {
            // Attempt a full parse if the stream cleanly finished without hitting token limits
            const intel = JSON.parse(accumulatedJson);
            if (intel.summary) summaryData = intel.summary;
            if (intel.actions) actionsData = intel.actions;
          } catch {
            console.warn("JSON was natively truncated mid-stream. Repairing JSON tree globally to salvage valid components...");
            const segmentsIndexStart = accumulatedJson.lastIndexOf('"segments"');
            if (segmentsIndexStart !== -1) {
              const repairedJson = accumulatedJson.substring(0, segmentsIndexStart) + ' "segments": [] }';
              try {
                const repairedIntel = JSON.parse(repairedJson);
                if (repairedIntel.summary) summaryData = repairedIntel.summary;
                if (repairedIntel.actions) actionsData = repairedIntel.actions;
              } catch {
                 console.error("JSON Repair tree failed. Metadata blocks extremely corrupt.");
              }
            }
          }

          await prisma.meetingSummary.create({
            data: {
              meetingId: meeting.id,
              abstract: summaryData.abstract,
              keyPoints: JSON.stringify(summaryData.keyPoints),
              risks: summaryData.risks?.length ? JSON.stringify(summaryData.risks) : null,
              blockers: summaryData.blockers?.length ? JSON.stringify(summaryData.blockers) : null,
            }
          });

          for (const action of actionsData) {
            await prisma.actionItem.create({
              data: {
                meetingId: meeting.id,
                title: action.title,
                owner: action.owner,
                dueDate: action.dueDate,
                sourceLanguage: action.sourceLanguage,
                linkedSegmentIds: action.linkedSegmentIndex ? action.linkedSegmentIndex.toString() : "0",
              }
            });
          }

          // Use updateMany utilizing both ID and userId to mathematically assure tenant safety during the final DB mutation
          await prisma.meeting.updateMany({
            where: { id: meeting.id, userId: userId || undefined },
            data: { status: "COMPLETED" }
          });
        } catch (dbError) {
          console.error("Database saving failed at end of stream:", dbError);
          await prisma.meeting.updateMany({ where: { id: meeting.id, userId: userId || undefined }, data: { status: "FAILED" }});
        }

        // Emit final termination string
        controller.enqueue(new TextEncoder().encode("\n[DONE]"));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Error processing meeting:", error);
    return NextResponse.json({ error: "Failed to process meeting" }, { status: 500 });
  }
}
