import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateMeetingMetadataWithGemini } from '@/lib/gemini';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const meetingIdInput = formData.get('meetingId') as string | null;

    if (!meetingIdInput) {
      return NextResponse.json({ error: "No meetingId provided for finalization" }, { status: 400 });
    }

    // Step 1: Forward the very last blob chunk natively to the chunk processor so we don't lose the final 10 seconds of conversation
    const chunkResponse = await fetch(`http://localhost:3000/api/meetings/process/chunk`, {
      method: "POST",
      body: formData
    });
    
    if (!chunkResponse.ok) {
      console.warn("Final chunk upload failed natively, proceeding to summarize existing contextual buffers anyway.");
    }
    
    const parsedData = await chunkResponse.json();
    const meetingId = parsedData.meetingId || meetingIdInput;

    const { userId } = await import('@clerk/nextjs/server').then(m => m.auth());
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    
    // CRITICAL SECURITY FIX: Prevent attackers from forcing heavy AI metadata compute on unauthorized meetings
    if (meeting.userId && meeting.userId !== userId) {
      return NextResponse.json({ error: "Forbidden: You do not own this meeting metadata scope." }, { status: 403 });
    }

    // Step 2: Grab the completely assembled and chronologically ordered transcript segments from the persistent Database
    const segments = await prisma.transcriptSegment.findMany({
      where: { meetingId },
      orderBy: { startTime: 'asc' }
    });

    if (segments.length === 0) {
      await prisma.meeting.update({ where: { id: meetingId }, data: { status: "COMPLETED" } });
      return NextResponse.json({ success: true, meetingId });
    }

    // Convert structured segment objects into single continuous semantic block for Gemini metadata evaluation
    const unifiedTranscript = segments.map(s => {
      return `[${s.startTime.toFixed(1)}s - ${s.speakerLabel}] (${s.detectedLanguage}): ${s.translatedTextEn || s.originalText}`;
    }).join("\n");

    // Step 3: Run the lightweight metadata pass (takes just a few seconds as it parses pure text)
    const intel = await generateMeetingMetadataWithGemini(unifiedTranscript);

    await prisma.meetingSummary.create({
      data: {
        meetingId: meetingId,
        abstract: intel.summary.abstract,
        keyPoints: JSON.stringify(intel.summary.keyPoints),
        risks: intel.summary.risks?.length ? JSON.stringify(intel.summary.risks) : null,
        blockers: intel.summary.blockers?.length ? JSON.stringify(intel.summary.blockers) : null,
      }
    });

    for (const action of intel.actions) {
      await prisma.actionItem.create({
        data: {
          meetingId: meetingId,
          title: action.title,
          owner: action.owner,
          dueDate: action.dueDate,
          sourceLanguage: action.sourceLanguage,
          linkedSegmentIds: action.linkedSegmentIndex ? action.linkedSegmentIndex.toString() : "0",
        }
      });
    }

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "COMPLETED" }
    });

    return NextResponse.json({ success: true, meetingId });
  } catch (error) {
    console.error("Finalization metadata compilation crashed:", error);
    return NextResponse.json({ error: "Failed to finalize meeting" }, { status: 500 });
  }
}
