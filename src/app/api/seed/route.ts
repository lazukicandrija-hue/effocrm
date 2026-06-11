import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (key !== "effortless-seed-2026") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Debug: check what schemas and permissions we have
    const schemas = await prisma.$queryRawUnsafe(`SELECT schema_name FROM information_schema.schemata`);
    const currentUser = await prisma.$queryRawUnsafe(`SELECT current_user, current_database()`);
    const grants = await prisma.$queryRawUnsafe(`SELECT grantee, privilege_type FROM information_schema.schema_privileges WHERE schema_name = 'public' LIMIT 10`);
    
    // Check if tables exist
    const tables = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);

    return NextResponse.json({ schemas, currentUser, grants, tables });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
