import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await import('@clerk/nextjs/server').then(m => m.auth());
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Ensure we only fetch if the user absolutely owns this meeting
    const meeting = await prisma.meeting.findFirst({
      where: { id: params.id, userId },
      include: {
        segments: { orderBy: { startTime: 'asc' } },
        actions: true,
        summary: true
      }
    });

    if (!meeting) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const meetingData = meeting as typeof meeting & {
      segments: unknown[];
      actions: unknown[];
      summary: unknown;
    };

    return NextResponse.json({
      meeting: {
        id: meetingData.id,
        title: meetingData.title,
        status: meetingData.status,
        createdAt: meetingData.createdAt
      },
      segments: meetingData.segments,
      actions: meetingData.actions,
      summary: meetingData.summary
    });
  } catch (error) {
    console.error("Error fetching meeting:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await import('@clerk/nextjs/server').then(m => m.auth());
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.meeting.deleteMany({
      where: { id: params.id, userId }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting meeting:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
