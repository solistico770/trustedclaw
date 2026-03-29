import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { transitionCaseStatus } from "@/lib/case-manager";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, reason, next_action_date, user_id } = await req.json();
  if (!status || !user_id) return NextResponse.json({ error: "status and user_id required" }, { status: 400 });

  const db = createServiceClient();
  await transitionCaseStatus(db, id, user_id, status, "user", reason, next_action_date);

  return NextResponse.json({ success: true });
}
