import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

// Stores the complete recording in Blob storage immediately, independent of
// transcription. This guarantees the audio itself is never lost even if the
// (much slower, less reliable) transcription pipeline that follows fails.
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in to PolyNotes first." }, { status: 401 });
    }

    const formData = await request.formData();
    const audioBlob = formData.get('audio') as File | null;
    const title = (formData.get('title') as string) || "Untitled Meeting";

    if (!audioBlob) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    const meeting = await prisma.meeting.create({
      data: { title, status: "PROCESSING", userId }
    });

    const ext = audioBlob.name?.includes('.') ? audioBlob.name.split('.').pop() : 'webm';
    const blob = await put(`meetings/${meeting.id}.${ext}`, audioBlob, {
      access: 'public',
      contentType: audioBlob.type || 'audio/webm',
    });

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { audioUrl: blob.url }
    });

    return NextResponse.json({ meetingId: meeting.id, audioUrl: blob.url });
  } catch (error) {
    console.error("Error uploading meeting audio:", error);
    return NextResponse.json({ error: "Failed to upload audio" }, { status: 500 });
  }
}
