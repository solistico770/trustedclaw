export type PolicyRule = {
  id: string;
  priority: number;
  condition: {
    action_type?: string[];
    severity?: string[];
    urgency?: string[];
    gate_type?: string[];
    entity_type?: string[];
    confidence_below?: number;
  };
  decision: "approve" | "reject" | "require_human";
  reason: string;
};

export type EvaluationContext = {
  action_type: string;
  severity?: string;
  urgency?: string;
  gate_type?: string;
  entity_type?: string;
  confidence?: number;
};

export type PolicyDecisionResult = {
  decision: "approve" | "reject" | "require_human";
  matched_rule_id: string;
  reasoning: string;
};

const DEFAULT_RULE: PolicyRule = {
  id: "default-require-human",
  priority: 9999,
  condition: {},
  decision: "require_human",
  reason: "No matching rule found — defaulting to human review",
};

function matchesCondition(rule: PolicyRule, ctx: EvaluationContext): boolean {
  const c = rule.condition;
  if (c.action_type?.length && !c.action_type.includes(ctx.action_type)) return false;
  if (c.severity?.length && ctx.severity && !c.severity.includes(ctx.severity)) return false;
  if (c.urgency?.length && ctx.urgency && !c.urgency.includes(ctx.urgency)) return false;
  if (c.gate_type?.length && ctx.gate_type && !c.gate_type.includes(ctx.gate_type)) return false;
  if (c.entity_type?.length && ctx.entity_type && !c.entity_type.includes(ctx.entity_type)) return false;
  if (c.confidence_below !== undefined && ctx.confidence !== undefined && ctx.confidence >= c.confidence_below) return false;
  return true;
}

export function evaluatePolicy(
  rules: PolicyRule[],
  ctx: EvaluationContext
): PolicyDecisionResult {
  const sorted = [...rules, DEFAULT_RULE].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (matchesCondition(rule, ctx)) {
      return {
        decision: rule.decision,
        matched_rule_id: rule.id,
        reasoning: rule.reason,
      };
    }
  }

  // Should never reach here due to DEFAULT_RULE, but safety fallback
  return {
    decision: "require_human",
    matched_rule_id: "fallback",
    reasoning: "Fallback: no rules matched",
  };
}
