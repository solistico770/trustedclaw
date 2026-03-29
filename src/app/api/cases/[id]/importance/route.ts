import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { recordCaseChange } from "@/lib/case-manager";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { importance_level, reason, user_id } = await req.json();
  if (!importance_level || !user_id) return NextResponse.json({ error: "importance_level and user_id required" }, { status: 400 });

  const db = createServiceClient();
  const { data: current } = await db.from("cases").select("importance_level").eq("id", id).single();

  await db.from("cases").update({ importance_level }).eq("id", id);
  await recordCaseChange(db, id, "user", "importance_level", String(current?.importance_level), String(importance_level), reason);
  await logAudit(db, { user_id, actor: "user", action_type: "case_importance_override", target_type: "case", target_id: id, reasoning: reason });

  return NextResponse.json({ success: true });
}
