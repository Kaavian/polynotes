import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { transcribeChunkWithGemini } from '@/lib/gemini';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

// Transcribes ONE short (~60-90s) slice of a meeting's audio, uploaded by the
// client in sequence after the full recording has already been saved via
// /api/meetings/upload. Keeping each call this small is what keeps every
// request comfortably inside Vercel's function timeout regardless of how
// long the overall meeting ran.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meeting = await prisma.meeting.findUnique({ where: { id: params.id } });
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    if (meeting.userId !== userId) {
      return NextResponse.json({ error: "Forbidden: you do not own this meeting." }, { status: 403 });
    }

    const formData = await request.formData();
    const audioChunk = formData.get('audio') as File | null;
    const mimeType = (formData.get('mimeType') as string) || 'audio/wav';
    const startOffset = parseFloat((formData.get('startOffset') as string) || "0");

    if (!audioChunk) {
      return NextResponse.json({ error: "No audio provided for this chunk" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioChunk.arrayBuffer());
    const segments = await transcribeChunkWithGemini(buffer, mimeType);

    for (const s of segments) {
      await prisma.transcriptSegment.create({
        data: {
          meetingId: meeting.id,
          speakerLabel: s.speakerLabel || "Speaker 1",
          startTime: (s.startTime ?? 0) + startOffset,
          endTime: (s.endTime ?? 0) + startOffset,
          originalText: s.originalText,
          detectedLanguage: s.detectedLanguage || "English",
          translatedTextEn: s.translatedTextEn,
          codeSwitchFlag: s.codeSwitchFlag || false,
        },
      });
    }

    return NextResponse.json({ success: true, segmentCount: segments.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to transcribe audio chunk";
    console.error(`Chunk transcription failed for meeting ${params.id}:`, error);
    await prisma.meeting.update({
      where: { id: params.id },
      data: { status: "FAILED", error: message },
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
