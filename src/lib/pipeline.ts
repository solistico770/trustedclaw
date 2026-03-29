import { SupabaseClient } from "@supabase/supabase-js";
import { enrichEvent, EnrichmentResult } from "./gemini";
import { classifyCase } from "./gemini-case";
import { evaluatePolicy, PolicyRule } from "./policy-engine";
import { logAudit } from "./audit";
import {
  findOrCreateCase,
  addEventToCase,
  updateCaseEntities,
  updateCaseClassification,
  transitionCaseStatus,
} from "./case-manager";

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
    if (status === "completed" || status === "permanent_failure") return;

    // Mark processing
    await db.from("events").update({
      processing_status: "processing",
      processing_started_at: new Date().toISOString(),
    }).eq("id", eventId);

    // 2. Normalize
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

    // Re-fetch
    const { data: ev2 } = await db.from("events").select("*").eq("id", eventId).single();
    if (!ev2) return;
    const np = ev2.normalized_payload;

    // 3. Enrich (event-level — extract entities from this message)
    let enrichment: EnrichmentResult | null = null;
    const currentStatus = ev2.processing_status;

    if (["normalized", "enrichment_failed"].includes(currentStatus)) {
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

        // Entity linking (event-level)
        for (const me of enrichment.mentioned_entities) {
          if (me.confidence < 0.7) continue;

          const { data: existing } = await db.from("entities")
            .select("id").eq("user_id", userId).ilike("canonical_name", me.name).limit(1);

          let entityId: string;
          if (existing && existing.length > 0) {
            entityId = existing[0].id;
          } else {
            const entityType = ["person", "company", "project", "invoice"].includes(me.type) ? me.type : "other";
            const { data: newEntity } = await db.from("entities").insert({
              user_id: userId, type: entityType, canonical_name: me.name, auto_created: true,
            }).select("id").single();
            if (!newEntity) continue;
            entityId = newEntity.id;
          }

          await db.from("event_entities").insert({
            event_id: eventId, entity_id: entityId, role: "mentioned", confidence_score: me.confidence,
          });
        }
      } catch (e) {
        enrichment = null;
        await db.from("events").update({ processing_status: "enrichment_failed" }).eq("id", eventId);
        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "enrich_failed",
          target_type: "event", target_id: eventId, reasoning: String(e),
        });
      }
    } else if (ev2.enrichment_data) {
      enrichment = ev2.enrichment_data;
    }

    // 3.5. CASE ASSIGNMENT — find or create case, link event
    const channelId = ev2.channel_id;
    const threadId = ev2.thread_id;

    let caseId = ev2.case_id;
    if (!caseId) {
      caseId = await findOrCreateCase(db, userId, channelId, threadId, np);
      await addEventToCase(db, caseId, eventId);

      // Propagate entity links to case level
      const { data: eventEnts } = await db.from("event_entities")
        .select("entity_id, role").eq("event_id", eventId);
      if (eventEnts && eventEnts.length > 0) {
        await updateCaseEntities(db, caseId, eventEnts);
      }
    }

    // 4. CASE-LEVEL CLASSIFICATION (replaces event-level)
    const updatedStatus = (await db.from("events").select("processing_status").eq("id", eventId).single()).data?.processing_status;

    if (!updatedStatus || ["enriched", "enrichment_failed", "normalized", "classification_failed"].includes(updatedStatus)) {
      try {
        // Gather ALL events in this case for holistic classification
        const { data: caseEvents } = await db.from("events")
          .select("normalized_payload, enrichment_data")
          .eq("case_id", caseId)
          .order("occurred_at", { ascending: true })
          .limit(20);

        const eventContents = (caseEvents || [])
          .map(e => e.normalized_payload?.content_text || "")
          .filter(Boolean);

        // Get entity names for context
        const { data: caseEnts } = await db.from("case_entities")
          .select("entities(canonical_name)")
          .eq("case_id", caseId);
        const entityNames = (caseEnts || [])
          .map((ce: Record<string, unknown>) => {
            const ent = ce.entities as Record<string, string> | null;
            return ent?.canonical_name;
          })
          .filter(Boolean) as string[];

        // Get current case state
        const { data: currentCase } = await db.from("cases")
          .select("title, status, importance_level").eq("id", caseId).single();

        const caseClassification = await classifyCase(
          currentCase?.title || null,
          eventContents,
          entityNames,
          currentCase?.status,
          currentCase?.importance_level
        );

        // Store classification (linked to both event and case)
        const importanceScore = caseClassification.importance_level * 10;
        await db.from("classifications").insert({
          event_id: eventId,
          case_id: caseId,
          user_id: userId,
          severity: caseClassification.severity,
          urgency: caseClassification.urgency,
          importance_score: importanceScore,
          reasoning: caseClassification.reasoning,
          confidence: 0.9,
          classified_by: "agent",
        });

        // Update case with new classification
        await updateCaseClassification(db, caseId, userId, {
          severity: caseClassification.severity,
          urgency: caseClassification.urgency,
          importance_level: caseClassification.importance_level,
          escalation_level: caseClassification.escalation_level,
          title: caseClassification.title,
          summary: caseClassification.summary,
          reasoning: caseClassification.reasoning,
        });

        // Update case status if AI suggests change
        if (caseClassification.suggested_status && caseClassification.suggested_status !== currentCase?.status) {
          await transitionCaseStatus(db, caseId, userId, caseClassification.suggested_status, "agent",
            `AI suggests: ${caseClassification.reasoning}`);
        }

        await db.from("events").update({ processing_status: "classified" }).eq("id", eventId);

        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "case_classify",
          target_type: "case", target_id: caseId,
          reasoning: `${caseClassification.severity}/${caseClassification.urgency}, importance=${caseClassification.importance_level}/10, escalation=${caseClassification.escalation_level}`,
        });
      } catch (e) {
        // Default case classification on failure
        await db.from("classifications").insert({
          event_id: eventId, case_id: caseId, user_id: userId,
          severity: "medium", urgency: "normal",
          importance_score: 50, reasoning: "Classification failed — default applied",
          confidence: 0, classified_by: "agent",
        });
        await db.from("events").update({ processing_status: "classified" }).eq("id", eventId);

        await logAudit(db, {
          user_id: userId, actor: "agent", action_type: "case_classify_failed",
          target_type: "case", target_id: caseId, reasoning: String(e),
        });
      }
    }

    // 5. CASE-LEVEL TRIAGE
    // Check if case already has an open triage decision
    const { data: existingTriage } = await db.from("triage_decisions")
      .select("id").eq("case_id", caseId).eq("status", "open").limit(1);

    if (!existingTriage || existingTriage.length === 0) {
      // Get current case state
      const { data: caseState } = await db.from("cases")
        .select("importance_level, escalation_level, current_severity")
        .eq("id", caseId).single();

      const importance = caseState?.importance_level || 5;
      const escalation = caseState?.escalation_level || "none";
      const severity = caseState?.current_severity || "medium";

      let triageDecision: "autonomous_resolve" | "escalate" | "discard" = "escalate";
      let triageReasoning = "";

      // Critical always escalates
      if (severity === "critical" || escalation === "critical" || escalation === "high") {
        triageDecision = "escalate";
        triageReasoning = `Case escalation=${escalation}, severity=${severity} — requires human`;
      } else if (severity === "info" && importance <= 2) {
        triageDecision = "discard";
        triageReasoning = "Low importance informational case — discarded";
      } else if (importance <= 3 && escalation === "none") {
        // Try autonomous
        const { data: policy } = await db.from("policies")
          .select("*").eq("user_id", userId).eq("is_active", true)
          .order("version", { ascending: false }).limit(1).single();

        const rules: PolicyRule[] = policy?.rules || [];
        const policyResult = evaluatePolicy(rules, {
          action_type: "auto_resolve",
          severity,
          gate_type: np.gate_type,
          confidence: 0.8,
        });

        if (policyResult.decision === "approve") {
          triageDecision = "autonomous_resolve";
          triageReasoning = `Low importance (${importance}/10), policy approves`;
        } else {
          triageDecision = "escalate";
          triageReasoning = `Low importance but policy requires human: ${policyResult.reasoning}`;
        }
      } else {
        triageDecision = "escalate";
        triageReasoning = `Importance ${importance}/10, severity ${severity} — requires human review`;
      }

      const triageStatus = triageDecision === "escalate" ? "open" :
        triageDecision === "discard" ? "dismissed" : "resolved";

      await db.from("triage_decisions").insert({
        event_id: eventId,
        case_id: caseId,
        user_id: userId,
        decision: triageDecision,
        reasoning: triageReasoning,
        status: triageStatus,
        resolved_by: triageDecision !== "escalate" ? "agent" : null,
        resolved_at: triageDecision !== "escalate" ? new Date().toISOString() : null,
      });

      // If escalated, update case status
      if (triageDecision === "escalate") {
        await transitionCaseStatus(db, caseId, userId, "action_needed", "agent", triageReasoning);
      }

      await logAudit(db, {
        user_id: userId, actor: "agent", action_type: "case_triage",
        target_type: "case", target_id: caseId,
        reasoning: `${triageDecision}: ${triageReasoning}`,
      });
    }
    // If there IS already an open triage — the case importance was already updated above via updateCaseClassification

    // 6. Mark event completed
    await db.from("events").update({ processing_status: "completed" }).eq("id", eventId);

    await logAudit(db, {
      user_id: userId, actor: "agent", action_type: "pipeline_complete",
      target_type: "event", target_id: eventId, reasoning: `Case: ${caseId}`,
    });
  } catch (err) {
    console.error(`[pipeline] Error processing event ${eventId}:`, err);
    const { data: evRetry } = await db.from("events").select("retry_count").eq("id", eventId).single();
    await db.from("events").update({
      processing_status: "needs_review",
      retry_count: (evRetry?.retry_count || 0) + 1,
    }).eq("id", eventId);
    await logAudit(db, {
      user_id: userId, actor: "agent", action_type: "pipeline_error",
      target_type: "event", target_id: eventId, reasoning: String(err),
    });
  }
}
