// API: single Phone — rename / edit notes (PUT) and delete (DELETE). Deleting a
// phone unassigns its accounts (it never deletes accounts).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const data: any = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
    data.name = name;
  }
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;

  const phone = await prisma.phone.update({ where: { id: params.id }, data });
  return NextResponse.json(phone);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Free the accounts first (keep them; just remove the phone link), then delete.
  await prisma.account.updateMany({ where: { phoneId: params.id }, data: { phoneId: null } });
  await prisma.phone.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
