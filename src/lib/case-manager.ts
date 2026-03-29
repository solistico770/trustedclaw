import { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "./audit";

export async function findOrCreateCase(
  db: SupabaseClient,
  userId: string,
  channelId: string | null,
  threadId: string | null,
  normalizedPayload: Record<string, string>
): Promise<string> {
  // Try to find an existing open case for this channel
  if (channelId) {
    const { data: existing } = await db
      .from("cases")
      .select("id")
      .eq("user_id", userId)
      .eq("channel_id", channelId)
      .not("status", "in", '("closed")')
      .order("last_event_at", { ascending: false })
      .limit(1)
      .single();

    if (existing) return existing.id;
  }

  // Create new case
  const title = (normalizedPayload.content_text || "New case").slice(0, 120);
  const now = new Date().toISOString();

  const { data: newCase, error } = await db.from("cases").insert({
    user_id: userId,
    channel_id: channelId,
    thread_id: threadId,
    title,
    status: "open",
    importance_level: 5,
    escalation_level: "none",
    opened_by: "system",
    event_count: 0,
    first_event_at: now,
    last_event_at: now,
  }).select("id").single();

  if (error || !newCase) throw new Error(`Failed to create case: ${error?.message}`);

  await logAudit(db, {
    user_id: userId,
    actor: "system",
    action_type: "case_created",
    target_type: "case",
    target_id: newCase.id,
    reasoning: `New case from channel: ${normalizedPayload.channel_name || "unknown"}`,
  });

  return newCase.id;
}

export async function addEventToCase(
  db: SupabaseClient,
  caseId: string,
  eventId: string
) {
  // Link event to case
  await db.from("events").update({ case_id: caseId }).eq("id", eventId);

  // Get current event timestamp
  const { data: ev } = await db.from("events").select("occurred_at").eq("id", eventId).single();

  // Update case counters
  const { data: caseData } = await db.from("cases").select("event_count").eq("id", caseId).single();

  await db.from("cases").update({
    event_count: (caseData?.event_count || 0) + 1,
    last_event_at: ev?.occurred_at || new Date().toISOString(),
  }).eq("id", caseId);
}

export async function updateCaseEntities(
  db: SupabaseClient,
  caseId: string,
  eventEntities: Array<{ entity_id: string; role: string }>
) {
  for (const ee of eventEntities) {
    const caseRole = ee.role === "sender" ? "primary" : "mentioned";

    // Upsert — ignore conflict on unique(case_id, entity_id)
    await db.from("case_entities").upsert(
      { case_id: caseId, entity_id: ee.entity_id, role: caseRole },
      { onConflict: "case_id,entity_id" }
    );
  }
}

export async function recordCaseChange(
  db: SupabaseClient,
  caseId: string,
  changedBy: "agent" | "user" | "heartbeat" | "system",
  fieldChanged: string,
  oldValue: string | null,
  newValue: string,
  reasoning?: string
) {
  await db.from("case_history").insert({
    case_id: caseId,
    changed_by: changedBy,
    field_changed: fieldChanged,
    old_value: oldValue,
    new_value: newValue,
    reasoning,
  });
}

export async function updateCaseClassification(
  db: SupabaseClient,
  caseId: string,
  userId: string,
  updates: {
    severity: string;
    urgency: string;
    importance_level: number;
    escalation_level: string;
    title?: string;
    summary?: string;
    reasoning: string;
  }
) {
  // Get current values for history tracking
  const { data: current } = await db.from("cases")
    .select("current_severity, current_urgency, importance_level, escalation_level, title")
    .eq("id", caseId).single();

  const updateData: Record<string, unknown> = {
    current_severity: updates.severity,
    current_urgency: updates.urgency,
    importance_level: updates.importance_level,
    escalation_level: updates.escalation_level,
    classification_reasoning: updates.reasoning,
  };

  if (updates.title) updateData.title = updates.title;
  if (updates.summary) updateData.summary = updates.summary;

  // Determine if escalation changed
  if (current) {
    if (current.importance_level !== updates.importance_level) {
      await recordCaseChange(db, caseId, "agent", "importance_level",
        String(current.importance_level), String(updates.importance_level), updates.reasoning);
    }
    if (current.escalation_level !== updates.escalation_level) {
      await recordCaseChange(db, caseId, "agent", "escalation_level",
        current.escalation_level, updates.escalation_level, updates.reasoning);

      updateData.escalation_reasoning = updates.reasoning;
    }
    if (current.current_severity !== updates.severity) {
      await recordCaseChange(db, caseId, "agent", "severity",
        current.current_severity, updates.severity, updates.reasoning);
    }
  }

  await db.from("cases").update(updateData).eq("id", caseId);

  await logAudit(db, {
    user_id: userId,
    actor: "agent",
    action_type: "case_classified",
    target_type: "case",
    target_id: caseId,
    reasoning: `${updates.severity}/${updates.urgency}, importance=${updates.importance_level}, escalation=${updates.escalation_level}`,
  });
}

export async function transitionCaseStatus(
  db: SupabaseClient,
  caseId: string,
  userId: string,
  newStatus: string,
  changedBy: "agent" | "user" | "heartbeat" | "system",
  reasoning?: string,
  nextActionDate?: string
) {
  const { data: current } = await db.from("cases")
    .select("status").eq("id", caseId).single();

  if (current?.status === newStatus) return;

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "closed") updateData.closed_at = new Date().toISOString();
  if (newStatus === "scheduled" && nextActionDate) updateData.next_action_date = nextActionDate;
  if (newStatus === "closed") {
    updateData.resolved_by = changedBy;
    updateData.resolve_reason = reasoning;
  }

  await db.from("cases").update(updateData).eq("id", caseId);

  await recordCaseChange(db, caseId, changedBy, "status",
    current?.status || null, newStatus, reasoning);

  await logAudit(db, {
    user_id: userId,
    actor: changedBy,
    action_type: `case_${newStatus}`,
    target_type: "case",
    target_id: caseId,
    reasoning,
  });
}
