import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const { userId } = await import('@clerk/nextjs/server').then(m => m.auth());
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const meetings = await prisma.meeting.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ meetings });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
