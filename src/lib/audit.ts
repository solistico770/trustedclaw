import { SupabaseClient } from "@supabase/supabase-js";

export async function logAudit(
  db: SupabaseClient,
  params: {
    user_id: string;
    actor: "agent" | "user" | "heartbeat" | "policy_engine" | "system";
    action_type: string;
    target_type: string;
    target_id?: string;
    reasoning?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await db.from("audit_logs").insert({
    user_id: params.user_id,
    actor: params.actor,
    action_type: params.action_type,
    target_type: params.target_type,
    target_id: params.target_id,
    reasoning: params.reasoning,
    metadata: params.metadata || {},
  });
  if (error) console.error("[audit] failed to write:", error.message);
}
