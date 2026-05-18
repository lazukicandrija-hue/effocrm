// API: Single account operations (GET, PUT, DELETE)
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Get single account
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const account = await prisma.account.findUnique({
      where: { id: params.id },
      include: {
        model: true,
        dailyStats: { orderBy: { date: "desc" }, take: 30 },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json(account);
  } catch (error) {
    console.error("Account fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 });
  }
}

// PUT - Update account
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
    const { username, modelId, niche, status, followers, notes } = body;

    // Check if status changed to BANNED
    const existing = await prisma.account.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (username) updateData.username = username.replace("@", "");
    if (modelId) updateData.modelId = modelId;
    if (niche) updateData.niche = niche;
    if (status) {
      updateData.status = status;
      // Auto-set dateBanned when status changes to BANNED
      if (status === "BANNED" && existing.status !== "BANNED") {
        updateData.dateBanned = new Date();
      }
      // Clear dateBanned if un-banned
      if (status !== "BANNED" && existing.status === "BANNED") {
        updateData.dateBanned = null;
      }
    }
    if (followers !== undefined) updateData.followers = followers;
    if (notes !== undefined) updateData.notes = notes;

    const account = await prisma.account.update({
      where: { id: params.id },
      data: updateData,
      include: { model: { select: { name: true } } },
    });

    return NextResponse.json(account);
  } catch (error) {
    console.error("Account update error:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

// DELETE - Delete account
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.account.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account delete error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
