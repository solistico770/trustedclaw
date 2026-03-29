import { SupabaseClient } from "@supabase/supabase-js";
import { enrichEvent, classifyEvent, EnrichmentResult } from "./gemini";
import { evaluatePolicy, PolicyRule, EvaluationContext } from "./policy-engine";
import { logAudit } from "./audit";

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 100, high: 75, medium: 50, low: 25, info: 10,
};
const URGENCY_WEIGHT: Record<string, number> = {
  immediate: 100, soon: 75, normal: 50, low: 25,
};

function computeImportance(severity: string, urgency: string): number {
  return ((SEVERITY_WEIGHT[severity] || 50) * 0.6 + (URGENCY_WEIGHT[urgency] || 50) * 0.4);
}

export async function runPipeline(db: SupabaseClient, eventId: string, userId: string) {
  try {
    // 1. Get event
    const { data: event, error: fetchErr } = await db
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();
    if (fetchErr || !event) throw new Error(`Event not found: ${eventId}`);

    const status = event.processing_status;

    // Already completed
    if (status === "completed" || status === "permanent_failure") return;

    // Mark processing
    await db.from("events").update({
      processing_status: "processing",
      processing_started_at: new Date().toISOString(),
    }).eq("id", eventId);

    // 2. Normalize (if needed)
    if (["pending", "processing"].includes(status)) {
      try {
        const raw = event.raw_payload;
        const normalized = {
          sender_id: raw.sender_id || raw.sender_name || "unknown",
          sender_name: raw.sender_name || "Unknown",
          content_text: raw.content || raw.message_content || "",
          content_type: raw.content_type || "text",
          channel_id: raw.channel_id || raw.channel_name || "default",
          channel_name: raw.channel_name || "Default",
          gate_type: raw.gate_type || "generic",
          occurred_at: raw.simulated_timestamp || event.occurred_at,
        };

        await db.from("events").update({
          normalized_payload: normalized,
          processing_status: "normalized",
        }).eq("id", eventId);

        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "normalize",
          target_type: "event", target_id: eventId, reasoning: "Normalized successfully",
        });
      } catch (e) {
        await db.from("events").update({ processing_status: "normalization_failed" }).eq("id", eventId);
        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "normalize_failed",
          target_type: "event", target_id: eventId, reasoning: String(e),
        });
        return;
      }
    }

    // Re-fetch after normalize
    const { data: ev2 } = await db.from("events").select("*").eq("id", eventId).single();
    if (!ev2) return;
    const np = ev2.normalized_payload;

    // 3. Enrich (Gemini)
    let enrichment: EnrichmentResult | null = null;
    if (["normalized", "enrichment_failed"].includes(ev2.processing_status) || status === "pending") {
      try {
        enrichment = await enrichEvent(np.content_text, np.sender_name, np.channel_name);

        await db.from("events").update({
          enrichment_data: enrichment,
          processing_status: "enriched",
        }).eq("id", eventId);

        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "enrich",
          target_type: "event", target_id: eventId,
          reasoning: `Language: ${enrichment.detected_language}, Entities: ${enrichment.mentioned_entities.length}`,
        });

        // Entity linking
        for (const me of enrichment.mentioned_entities) {
          if (me.confidence < 0.7) continue;

          // Try to find existing entity
          const { data: existing } = await db.from("entities")
            .select("id")
            .eq("user_id", userId)
            .ilike("canonical_name", me.name)
            .limit(1);

          let entityId: string;
          if (existing && existing.length > 0) {
            entityId = existing[0].id;
          } else {
            const entityType = ["person", "company", "project", "invoice"].includes(me.type) ? me.type : "other";
            const { data: newEntity } = await db.from("entities").insert({
              user_id: userId,
              type: entityType,
              canonical_name: me.name,
              auto_created: true,
            }).select("id").single();
            if (!newEntity) continue;
            entityId = newEntity.id;
          }

          await db.from("event_entities").insert({
            event_id: eventId,
            entity_id: entityId,
            role: "mentioned",
            confidence_score: me.confidence,
          });
        }
      } catch (e) {
        enrichment = null;
        await db.from("events").update({ processing_status: "enrichment_failed" }).eq("id", eventId);
        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "enrich_failed",
          target_type: "event", target_id: eventId, reasoning: String(e),
        });
        // Continue with reduced confidence
      }
    } else if (ev2.enrichment_data) {
      enrichment = ev2.enrichment_data;
    }

    // 4. Classify (Gemini)
    let severity = "medium";
    let urgency = "normal";
    let reasoning = "auto-classification failed — default applied";
    let confidence = 0;
    let proposedAction = "Review manually";

    const currentStatus = (await db.from("events").select("processing_status").eq("id", eventId).single()).data?.processing_status;

    if (!currentStatus || ["enriched", "enrichment_failed", "normalized", "classification_failed"].includes(currentStatus)) {
      try {
        const classification = await classifyEvent(np.content_text, enrichment || undefined, np.sender_name);
        severity = classification.severity;
        urgency = classification.urgency;
        reasoning = classification.reasoning;
        confidence = classification.confidence || 0.8;
        proposedAction = classification.proposed_action;

        const importanceScore = computeImportance(severity, urgency);

        await db.from("classifications").insert({
          event_id: eventId,
          user_id: userId,
          severity,
          urgency,
          importance_score: importanceScore,
          reasoning,
          confidence,
          classified_by: "agent",
        });

        await db.from("events").update({ processing_status: "classified" }).eq("id", eventId);

        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "classify",
          target_type: "event", target_id: eventId,
          reasoning: `${severity}/${urgency} (${(confidence * 100).toFixed(0)}%) — ${reasoning}`,
        });
      } catch (e) {
        // Default classification on failure
        const importanceScore = computeImportance("medium", "normal");
        await db.from("classifications").insert({
          event_id: eventId,
          user_id: userId,
          severity: "medium",
          urgency: "normal",
          importance_score: importanceScore,
          reasoning: "Classification failed — default applied",
          confidence: 0,
          classified_by: "agent",
        });
        await db.from("events").update({ processing_status: "classified" }).eq("id", eventId);
        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "classify_failed",
          target_type: "event", target_id: eventId, reasoning: String(e),
        });
      }
    }

    // 5. Triage
    const { data: existingTriage } = await db.from("triage_decisions")
      .select("id").eq("event_id", eventId).limit(1);

    if (!existingTriage || existingTriage.length === 0) {
      // Get latest classification
      const { data: cls } = await db.from("classifications")
        .select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).single();

      const evSeverity = cls?.severity || "medium";
      const evConfidence = cls?.confidence || 0;
      const evImportance = cls?.importance_score || 50;

      // Critical always escalates
      let triageDecision: "autonomous_resolve" | "escalate" | "discard" = "escalate";
      let triageReasoning = "";

      if (evSeverity === "critical") {
        triageDecision = "escalate";
        triageReasoning = "Critical severity — always escalates";
      } else if (evSeverity === "info" && evConfidence > 0.9) {
        triageDecision = "discard";
        triageReasoning = "Informational event with high confidence — discarded";
      } else if (evImportance < 40 && evConfidence > 0.7) {
        triageDecision = "autonomous_resolve";
        triageReasoning = `Low importance (${evImportance}) with adequate confidence — autonomous resolution`;
      } else {
        triageDecision = "escalate";
        triageReasoning = `Importance ${evImportance}, severity ${evSeverity} — requires human review`;
      }

      // If autonomous, check policy
      if (triageDecision === "autonomous_resolve") {
        const { data: policy } = await db.from("policies")
          .select("*").eq("user_id", userId).eq("is_active", true)
          .order("version", { ascending: false }).limit(1).single();

        const rules: PolicyRule[] = policy?.rules || [];
        const policyResult = evaluatePolicy(rules, {
          action_type: proposedAction,
          severity: evSeverity,
          gate_type: np.gate_type,
          confidence: evConfidence,
        });

        if (policyResult.decision === "require_human" || policyResult.decision === "reject") {
          triageDecision = "escalate";
          triageReasoning += ` → Policy: ${policyResult.reasoning}`;
        }
      }

      const triageStatus = triageDecision === "escalate" ? "open" :
        triageDecision === "discard" ? "dismissed" : "resolved";

      await db.from("triage_decisions").insert({
        event_id: eventId,
        user_id: userId,
        decision: triageDecision,
        reasoning: triageReasoning,
        status: triageStatus,
        resolved_by: triageDecision !== "escalate" ? "agent" : null,
        resolved_at: triageDecision !== "escalate" ? new Date().toISOString() : null,
      });

      await logAudit(db, {
        user_id: userId, actor: "agent", action_type: "triage",
        target_type: "event", target_id: eventId,
        reasoning: `${triageDecision}: ${triageReasoning}`,
      });
    }

    // 6. Mark completed
    await db.from("events").update({ processing_status: "completed" }).eq("id", eventId);

    await logAudit(db, {
      user_id: userId, actor: "agent", action_type: "pipeline_complete",
      target_type: "event", target_id: eventId, reasoning: "Pipeline completed successfully",
    });
  } catch (err) {
    console.error(`[pipeline] Error processing event ${eventId}:`, err);
    await db.from("events").update({
      processing_status: "needs_review",
      retry_count: (await db.from("events").select("retry_count").eq("id", eventId).single()).data?.retry_count + 1 || 1,
    }).eq("id", eventId);
    await logAudit(db, {
      user_id: userId, actor: "agent", action_type: "pipeline_error",
      target_type: "event", target_id: eventId, reasoning: String(err),
    });
  }
}
