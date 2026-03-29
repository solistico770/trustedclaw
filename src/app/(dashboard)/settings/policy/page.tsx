"use client";

import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type PolicyRule = {
  id: string;
  priority: number;
  condition: {
    action_type?: string[];
    severity?: string[];
    gate_type?: string[];
  };
  decision: "approve" | "reject" | "require_human";
  reason: string;
};

type Policy = {
  id: string;
  version: number;
  rules: PolicyRule[];
  is_active: boolean;
  created_at: string;
};

const DECISION_COLORS: Record<string, string> = {
  approve: "bg-green-700",
  reject: "bg-red-700",
  require_human: "bg-yellow-700",
};

export default function PolicyPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [versions, setVersions] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  // New rule form
  const [newRuleSeverity, setNewRuleSeverity] = useState("");
  const [newRuleGateType, setNewRuleGateType] = useState("");
  const [newRuleDecision, setNewRuleDecision] = useState<"approve" | "reject" | "require_human">("require_human");
  const [newRuleReason, setNewRuleReason] = useState("");

  const fetchPolicy = useCallback(async () => {
    const res = await fetch(`/api/policy?user_id=${DEMO_USER_ID}`);
    const data = await res.json();
    setPolicy(data.active);
    setVersions(data.versions || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPolicy(); }, [fetchPolicy]);

  async function addRule() {
    const rules = [...(policy?.rules || [])];
    const condition: Record<string, string[]> = {};
    if (newRuleSeverity) condition.severity = newRuleSeverity.split(",").map((s) => s.trim());
    if (newRuleGateType) condition.gate_type = newRuleGateType.split(",").map((s) => s.trim());

    rules.push({
      id: `rule-${Date.now()}`,
      priority: rules.length + 1,
      condition,
      decision: newRuleDecision,
      reason: newRuleReason || `Rule ${rules.length + 1}`,
    });

    await saveRules(rules);
    setNewRuleSeverity("");
    setNewRuleGateType("");
    setNewRuleReason("");
  }

  async function deleteRule(ruleId: string) {
    const rules = (policy?.rules || []).filter((r) => r.id !== ruleId);
    await saveRules(rules);
  }

  async function saveRules(rules: PolicyRule[]) {
    await fetch("/api/policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID, rules }),
    });
    fetchPolicy();
  }

  if (loading) return <div className="h-32 bg-zinc-900 rounded animate-pulse" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Policy Editor</h2>
        {policy && <Badge variant="outline">Version {policy.version}</Badge>}
      </div>

      {/* Current rules */}
      <div className="space-y-2">
        {(policy?.rules || []).map((rule, i) => (
          <Card key={rule.id} className="bg-zinc-900 border-zinc-800">
            <CardHeader className="py-2 px-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600">#{i + 1}</span>
                <Badge className={`${DECISION_COLORS[rule.decision]} text-white text-xs`}>{rule.decision}</Badge>
                {rule.condition.severity && <Badge variant="outline" className="text-xs">severity: {rule.condition.severity.join(", ")}</Badge>}
                {rule.condition.gate_type && <Badge variant="outline" className="text-xs">gate: {rule.condition.gate_type.join(", ")}</Badge>}
                <span className="text-xs text-zinc-400 flex-1">{rule.reason}</span>
                <Button variant="ghost" size="sm" className="text-red-400 text-xs" onClick={() => deleteRule(rule.id)}>
                  Delete
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}
        <Card className="bg-zinc-950 border-zinc-700 border-dashed">
          <CardContent className="py-3 text-xs text-zinc-600 text-center">
            Default Rule: require_human (cannot be deleted)
          </CardContent>
        </Card>
      </div>

      {/* Add rule form */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-sm">Add Rule</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">Severity (comma-separated)</label>
              <Input placeholder="low, info" value={newRuleSeverity} onChange={(e) => setNewRuleSeverity(e.target.value)} className="bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Gate Type</label>
              <Input placeholder="simulator" value={newRuleGateType} onChange={(e) => setNewRuleGateType(e.target.value)} className="bg-zinc-800 border-zinc-700" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500">Decision</label>
              <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm" value={newRuleDecision} onChange={(e) => setNewRuleDecision(e.target.value as "approve" | "reject" | "require_human")}>
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
                <option value="require_human">Require Human</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500">Reason</label>
              <Input placeholder="Why this rule?" value={newRuleReason} onChange={(e) => setNewRuleReason(e.target.value)} className="bg-zinc-800 border-zinc-700" />
            </div>
          </div>
          <Button onClick={addRule} size="sm">Add Rule</Button>
        </CardContent>
      </Card>

      {/* Version history */}
      {versions.length > 1 && (
        <div>
          <h3 className="text-sm font-bold text-zinc-400 mb-2">Version History</h3>
          <div className="space-y-1">
            {versions.map((v) => (
              <div key={v.id} className="flex gap-2 text-xs text-zinc-500">
                <span>v{v.version}</span>
                <span>{new Date(v.created_at).toLocaleString("he-IL")}</span>
                <span>{v.rules.length} rules</span>
                {v.is_active && <Badge className="bg-green-700 text-white text-xs">active</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
