import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { transitionCaseStatus } from "@/lib/case-manager";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { reason, user_id } = await req.json();
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();

  // Close case
  await transitionCaseStatus(db, id, user_id, "closed", "user", reason);

  // Resolve any open triage decisions for this case
  await db.from("triage_decisions")
    .update({ status: "resolved", resolved_by: "user", resolved_at: new Date().toISOString(), resolve_reason: reason })
    .eq("case_id", id)
    .eq("status", "open");

  return NextResponse.json({ success: true });
}
