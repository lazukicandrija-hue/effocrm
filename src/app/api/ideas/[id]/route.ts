// API: update an idea (status / saved prompt) or delete it.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.status === "string") data.status = body.status;
  if (typeof body.prompt === "string") data.prompt = body.prompt;
  if (typeof body.concept === "string") data.concept = body.concept;
  if (typeof body.title === "string") data.title = body.title.slice(0, 200);

  const idea = await prisma.idea.update({ where: { id: params.id }, data });
  return NextResponse.json({ idea });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.idea.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
