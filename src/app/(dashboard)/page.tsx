"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

type CaseEntity = {
  entity_id: string;
  role: string;
  entities: { id: string; canonical_name: string; type: string } | null;
};

type Case = {
  id: string;
  title: string | null;
  summary: string | null;
  status: string;
  importance_level: number;
  escalation_level: string;
  current_severity: string;
  current_urgency: string;
  event_count: number;
  last_event_at: string | null;
  first_event_at: string | null;
  next_action_date: string | null;
  created_at: string;
  case_entities: CaseEntity[];
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-600", action_needed: "bg-red-600", in_progress: "bg-yellow-600",
  addressed: "bg-green-600", scheduled: "bg-purple-600", closed: "bg-zinc-600", escalated: "bg-red-700",
};
const ESCALATION_COLORS: Record<string, string> = {
  none: "bg-zinc-700", low: "bg-blue-700", medium: "bg-yellow-700", high: "bg-orange-600", critical: "bg-red-700",
};
const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-blue-500", info: "bg-zinc-500",
};

function ImportanceBar({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5 items-center" title={`Importance: ${level}/10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`w-2 h-3 rounded-sm ${i < level ? (level >= 8 ? "bg-red-500" : level >= 5 ? "bg-yellow-500" : "bg-blue-500") : "bg-zinc-800"}`} />
      ))}
      <span className="text-xs text-zinc-500 mr-1">{level}</span>
    </div>
  );
}

export default function CasesBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const router = useRouter();

  const fetchCases = useCallback(async () => {
    const url = `/api/cases?user_id=${DEMO_USER_ID}${statusFilter ? `&status=${statusFilter}` : ""}&sort_by=importance`;
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data)) setCases(data);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchCases();
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("cases-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => fetchCases())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCases]);

  async function quickAction(caseId: string, action: string) {
    if (action === "close") {
      await fetch(`/api/cases/${caseId}/close`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: DEMO_USER_ID, reason: "Closed from board" }),
      });
    } else if (action === "addressed") {
      await fetch(`/api/cases/${caseId}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: DEMO_USER_ID, status: "addressed", reason: "Marked as addressed" }),
      });
    } else if (action === "schedule") {
      const date = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await fetch(`/api/cases/${caseId}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: DEMO_USER_ID, status: "scheduled", next_action_date: date, reason: "Scheduled for tomorrow" }),
      });
    }
    fetchCases();
  }

  if (loading) {
    return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-zinc-900 rounded-lg animate-pulse" />)}</div>;
  }

  if (cases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <div className="text-4xl mb-4">✅</div>
        <p className="text-lg">הכל תחת שליטה</p>
        <p className="text-sm">אין cases פתוחים כרגע</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Cases ({cases.length})</h2>
        <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All open</option>
          <option value="action_needed,escalated">Action needed</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="scheduled">Scheduled</option>
          <option value="addressed">Addressed</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {cases.map((c) => (
        <Card key={c.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-600 transition cursor-pointer" onClick={() => router.push(`/cases/${c.id}`)}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${STATUS_COLORS[c.status]} text-white`}>{c.status}</Badge>
              <Badge className={`${SEVERITY_COLORS[c.current_severity]} text-white text-xs`}>{c.current_severity}</Badge>
              {c.escalation_level !== "none" && (
                <Badge className={`${ESCALATION_COLORS[c.escalation_level]} text-white text-xs`}>esc: {c.escalation_level}</Badge>
              )}
              <span className="text-xs text-zinc-500">{c.event_count} events</span>
              <span className="text-xs text-zinc-600 mr-auto">{c.last_event_at ? new Date(c.last_event_at).toLocaleString("he-IL") : ""}</span>
            </div>
            <CardTitle className="text-base mt-1">{c.title || `Case ${c.id.slice(0, 8)}`}</CardTitle>
          </CardHeader>
          <CardContent>
            {c.summary && <p className="text-xs text-zinc-400 mb-2">{c.summary}</p>}
            <div className="flex items-center gap-3 mb-3">
              <ImportanceBar level={c.importance_level} />
              {c.case_entities?.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {c.case_entities.map((ce, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {ce.entities?.canonical_name} ({ce.entities?.type})
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="outline" onClick={() => quickAction(c.id, "addressed")}>Addressed</Button>
              <Button size="sm" variant="ghost" className="text-zinc-400" onClick={() => quickAction(c.id, "schedule")}>Schedule</Button>
              <Button size="sm" variant="ghost" className="text-red-400" onClick={() => quickAction(c.id, "close")}>Close</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
