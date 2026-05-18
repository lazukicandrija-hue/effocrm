// API: Models CRUD
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - List all models
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const models = await prisma.model.findMany({
      include: {
        accounts: {
          include: {
            dailyStats: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const modelsWithStats = models.map((model) => ({
      ...model,
      totalAccounts: model.accounts.length,
      activeAccounts: model.accounts.filter((a) => a.status === "ACTIVE").length,
      totalViews: model.accounts.reduce(
        (sum, a) =>
          sum +
          a.dailyStats.reduce((s, d) => s + d.instaViews + d.fbViews, 0),
        0
      ),
      totalInstaViews: model.accounts.reduce(
        (sum, a) =>
          sum + a.dailyStats.reduce((s, d) => s + d.instaViews, 0),
        0
      ),
      totalFbViews: model.accounts.reduce(
        (sum, a) =>
          sum + a.dailyStats.reduce((s, d) => s + d.fbViews, 0),
        0
      ),
    }));

    return NextResponse.json(modelsWithStats);
  } catch (error) {
    console.error("Models fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

// POST - Create new model
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, photo } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const model = await prisma.model.create({
      data: { name, photo: photo || null },
    });

    return NextResponse.json(model, { status: 201 });
  } catch (error) {
    console.error("Model create error:", error);
    return NextResponse.json({ error: "Failed to create model" }, { status: 500 });
  }
}
