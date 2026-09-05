import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateMeetingMetadataWithGemini } from '@/lib/gemini';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

// Runs once, after every audio chunk has already been transcribed and
// persisted via /api/meetings/[id]/chunk. Text-only, so it's fast and doesn't
// need to forward any audio anywhere - no server-to-server calls involved.
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

    const segments = await prisma.transcriptSegment.findMany({
      where: { meetingId: meeting.id },
      orderBy: { startTime: 'asc' },
    });

    if (segments.length === 0) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: "FAILED", error: "No speech was detected in this recording." },
      });
      return NextResponse.json({ error: "No speech was detected in this recording." }, { status: 422 });
    }

    // Prefer the English translation so nothing spoken only in Tamil/Hindi/etc.
    // gets dropped from the summary and action items.
    const unifiedTranscript = segments
      .map(s => `[${s.startTime.toFixed(1)}s - ${s.speakerLabel}] (${s.detectedLanguage}): ${s.translatedTextEn || s.originalText}`)
      .join("\n");

    const intel = await generateMeetingMetadataWithGemini(unifiedTranscript);

    await prisma.meetingSummary.create({
      data: {
        meetingId: meeting.id,
        abstract: intel.summary.abstract,
        keyPoints: JSON.stringify(intel.summary.keyPoints),
        risks: intel.summary.risks?.length ? JSON.stringify(intel.summary.risks) : null,
        blockers: intel.summary.blockers?.length ? JSON.stringify(intel.summary.blockers) : null,
      },
    });

    for (const action of intel.actions) {
      await prisma.actionItem.create({
        data: {
          meetingId: meeting.id,
          title: action.title,
          owner: action.owner,
          dueDate: action.dueDate,
          sourceLanguage: action.sourceLanguage,
          linkedSegmentIds: action.linkedSegmentIndex != null ? action.linkedSegmentIndex.toString() : "0",
        },
      });
    }

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: "COMPLETED", error: null },
    });

    return NextResponse.json({ success: true, meetingId: meeting.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize meeting";
    console.error(`Finalization failed for meeting ${params.id}:`, error);
    await prisma.meeting.update({
      where: { id: params.id },
      data: { status: "FAILED", error: message },
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
