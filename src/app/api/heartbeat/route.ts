import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { runPipeline } from "@/lib/pipeline";
import { logAudit } from "@/lib/audit";
import { createHash } from "crypto";

function generateRunId(): string {
  const window = Math.floor(Date.now() / (5 * 60 * 1000));
  return createHash("md5").update(String(window)).digest("hex");
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const triggeredBy = req.headers.get("x-triggered-by") || "vercel_cron";

  // Validate cron secret (skip for manual)
  if (triggeredBy !== "manual") {
    const secret = req.headers.get("x-cron-secret") || (await req.json().catch(() => ({}))).cron_secret;
    if (secret !== process.env.CRON_SECRET && triggeredBy !== "manual") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createServiceClient();
  const runId = triggeredBy === "manual" ? `manual-${Date.now()}` : generateRunId();

  // Idempotency check (skip for manual)
  if (triggeredBy !== "manual") {
    const { data: existing } = await db.from("heartbeat_logs")
      .select("id").eq("run_id", runId).limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ message: "Already ran in this window", run_id: runId });
    }
  }

  // We need a user_id. For now, get the first user who has events.
  const { data: anyEvent } = await db.from("events").select("user_id").limit(1).single();
  const userId = anyEvent?.user_id;
  if (!userId) {
    return NextResponse.json({ message: "No events to process", run_id: runId });
  }

  let eventsChecked = 0;
  let eventsRequeued = 0;
  let eventsStuck = 0;
  let escalationsReminded = 0;
  let status = "success";
  let errorMessage: string | null = null;

  try {
    // 1. Find pending events older than 2 minutes
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: pendingEvents } = await db.from("events")
      .select("id, user_id")
      .in("processing_status", ["pending", "normalization_failed", "enrichment_failed", "classification_failed", "triage_pending", "needs_review"])
      .lt("received_at", twoMinAgo)
      .lt("retry_count", 3)
      .limit(20);

    eventsChecked += pendingEvents?.length || 0;

    for (const ev of pendingEvents || []) {
      try {
        await runPipeline(db, ev.id, ev.user_id);
        eventsRequeued++;
      } catch (e) {
        console.error(`[heartbeat] failed to reprocess ${ev.id}:`, e);
      }
    }

    // 2. Find stuck events (processing > 10 minutes)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckEvents } = await db.from("events")
      .select("id, user_id")
      .eq("processing_status", "processing")
      .lt("processing_started_at", tenMinAgo)
      .limit(20);

    for (const ev of stuckEvents || []) {
      await db.from("events").update({ processing_status: "stuck" }).eq("id", ev.id);

      await db.from("triage_decisions").insert({
        event_id: ev.id,
        user_id: ev.user_id,
        decision: "escalate",
        reasoning: "Event stuck in processing for >10 minutes — requires attention",
        status: "open",
      });

      await logAudit(db, {
        user_id: ev.user_id, actor: "heartbeat", action_type: "stuck_detected",
        target_type: "event", target_id: ev.id, reasoning: "Processing stuck >10min",
      });

      eventsStuck++;
    }

    // 3. Find classified events without triage decision
    const { data: orphanedEvents } = await db.from("events")
      .select("id, user_id")
      .eq("processing_status", "classified")
      .limit(20);

    for (const ev of orphanedEvents || []) {
      try {
        await runPipeline(db, ev.id, ev.user_id);
        eventsRequeued++;
      } catch (e) {
        console.error(`[heartbeat] failed to triage ${ev.id}:`, e);
      }
    }

    eventsChecked += (stuckEvents?.length || 0) + (orphanedEvents?.length || 0);

    // 4. Find permanent failures (retry_count >= 3)
    const { data: permFailures } = await db.from("events")
      .select("id, user_id")
      .in("processing_status", ["normalization_failed", "enrichment_failed", "classification_failed", "needs_review"])
      .gte("retry_count", 3)
      .limit(10);

    for (const ev of permFailures || []) {
      await db.from("events").update({ processing_status: "permanent_failure" }).eq("id", ev.id);
      await db.from("triage_decisions").upsert({
        event_id: ev.id, user_id: ev.user_id,
        decision: "escalate", reasoning: "Permanent failure after 3+ retries",
        status: "open",
      }, { onConflict: "event_id" }).select();
      eventsStuck++;
    }

    // 5. Remind about open escalations > 4 hours
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: staleEscalations } = await db.from("triage_decisions")
      .select("id, user_id")
      .eq("decision", "escalate")
      .eq("status", "open")
      .eq("reminded", false)
      .lt("created_at", fourHoursAgo)
      .limit(20);

    for (const esc of staleEscalations || []) {
      await db.from("triage_decisions").update({ reminded: true }).eq("id", esc.id);
      await logAudit(db, {
        user_id: esc.user_id, actor: "heartbeat", action_type: "escalation_reminder",
        target_type: "triage_decision", target_id: esc.id,
        reasoning: "Open escalation >4 hours — reminder sent",
      });
      escalationsReminded++;
    }

    // 6. Un-snooze expired snoozed decisions
    const now = new Date().toISOString();
    const { data: unsnoozed } = await db.from("triage_decisions")
      .update({ status: "open", snoozed_until: null })
      .eq("status", "snoozed")
      .lt("snoozed_until", now)
      .select("id");

    if (unsnoozed && unsnoozed.length > 0) {
      eventsRequeued += unsnoozed.length;
    }

  } catch (e) {
    status = "failed";
    errorMessage = String(e);
    console.error("[heartbeat] error:", e);
  }

  const durationMs = Date.now() - startTime;

  // Write heartbeat log
  await db.from("heartbeat_logs").insert({
    run_id: runId,
    user_id: userId,
    triggered_by: triggeredBy as "pg_cron" | "vercel_cron" | "manual",
    run_at: new Date().toISOString(),
    duration_ms: durationMs,
    events_checked: eventsChecked,
    events_requeued: eventsRequeued,
    events_stuck: eventsStuck,
    escalations_reminded: escalationsReminded,
    status,
    error_message: errorMessage,
  });

  return NextResponse.json({
    run_id: runId,
    duration_ms: durationMs,
    events_checked: eventsChecked,
    events_requeued: eventsRequeued,
    events_stuck: eventsStuck,
    escalations_reminded: escalationsReminded,
    status,
  });
}
