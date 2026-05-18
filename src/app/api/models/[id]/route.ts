// API: Single model operations
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PUT - Update model
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const model = await prisma.model.update({
      where: { id: params.id },
      data: body,
    });
    return NextResponse.json(model);
  } catch (error) {
    console.error("Model update error:", error);
    return NextResponse.json({ error: "Failed to update model" }, { status: 500 });
  }
}

// DELETE - Delete model
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.model.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Model delete error:", error);
    return NextResponse.json({ error: "Failed to delete model" }, { status: 500 });
  }
}
