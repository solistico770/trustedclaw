import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { decision, reason, snooze_until, user_id } = body;

  if (!decision || !user_id) {
    return NextResponse.json({ error: "Missing decision or user_id" }, { status: 400 });
  }

  const db = createServiceClient();

  const updateData: Record<string, unknown> = {
    resolved_by: "user",
    resolve_reason: reason || null,
    resolved_at: new Date().toISOString(),
  };

  if (decision === "approve") {
    updateData.status = "resolved";
  } else if (decision === "dismiss") {
    updateData.status = "dismissed";
  } else if (decision === "snooze") {
    updateData.status = "snoozed";
    updateData.snoozed_until = snooze_until || new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    updateData.resolved_at = null;
    updateData.resolved_by = null;
  }

  const { error } = await db.from("triage_decisions").update(updateData).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(db, {
    user_id,
    actor: "user",
    action_type: `escalation_${decision}`,
    target_type: "triage_decision",
    target_id: id,
    reasoning: reason || `User ${decision}d the escalation`,
  });

  return NextResponse.json({ success: true });
}
