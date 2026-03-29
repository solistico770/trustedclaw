"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CaseDetail = {
  case: {
    id: string; title: string; summary: string; status: string;
    importance_level: number; escalation_level: string;
    current_severity: string; current_urgency: string;
    event_count: number; first_event_at: string; last_event_at: string;
    next_action_date: string | null; classification_reasoning: string;
    escalation_reasoning: string; created_at: string;
  };
  events: Array<{
    id: string; raw_payload: Record<string, string>; normalized_payload: Record<string, string> | null;
    enrichment_data: Record<string, unknown> | null; processing_status: string; occurred_at: string;
  }>;
  entities: Array<{ role: string; entities: { canonical_name: string; type: string } | null }>;
  history: Array<{ field_changed: string; old_value: string; new_value: string; changed_by: string; reasoning: string; created_at: string }>;
  triage_decisions: Array<{ decision: string; status: string; reasoning: string; created_at: string }>;
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-600", action_needed: "bg-red-600", in_progress: "bg-yellow-600",
  addressed: "bg-green-600", scheduled: "bg-purple-600", closed: "bg-zinc-600", escalated: "bg-red-700",
};

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCase = useCallback(async () => {
    const res = await fetch(`/api/cases/${id}`);
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  async function changeStatus(status: string) {
    await fetch(`/api/cases/${id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID, status, reason: `User set ${status}` }),
    });
    fetchCase();
  }

  async function closeCase() {
    await fetch(`/api/cases/${id}/close`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID, reason: "Closed by user" }),
    });
    fetchCase();
  }

  if (loading) return <div className="h-64 bg-zinc-900 rounded animate-pulse" />;
  if (!data?.case) return <p className="text-zinc-500">Case not found.</p>;

  const c = data.case;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge className={`${STATUS_COLORS[c.status]} text-white`}>{c.status}</Badge>
          <Badge variant="outline">{c.current_severity}/{c.current_urgency}</Badge>
          <Badge variant="outline">Importance: {c.importance_level}/10</Badge>
          {c.escalation_level !== "none" && <Badge variant="destructive">Escalation: {c.escalation_level}</Badge>}
          <span className="text-xs text-zinc-500 mr-auto">{c.event_count} events</span>
        </div>
        <h1 className="text-2xl font-bold">{c.title || `Case ${c.id.slice(0, 8)}`}</h1>
        {c.summary && <p className="text-sm text-zinc-400 mt-1">{c.summary}</p>}
        {c.classification_reasoning && <p className="text-xs text-zinc-500 mt-1">AI: {c.classification_reasoning}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {c.status !== "in_progress" && <Button size="sm" onClick={() => changeStatus("in_progress")}>Start Working</Button>}
        {c.status !== "addressed" && <Button size="sm" variant="outline" onClick={() => changeStatus("addressed")}>Mark Addressed</Button>}
        {c.status !== "closed" && <Button size="sm" variant="ghost" className="text-red-400" onClick={closeCase}>Close Case</Button>}
      </div>

      {/* Entities */}
      {data.entities.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {data.entities.map((ce, i) => (
            <Badge key={i} variant="secondary">{ce.entities?.canonical_name} ({ce.entities?.type}) — {ce.role}</Badge>
          ))}
        </div>
      )}

      {/* Event Timeline */}
      <div>
        <h3 className="text-lg font-bold mb-3">Event Timeline</h3>
        <div className="space-y-3 border-r-2 border-zinc-800 pr-4">
          {data.events.map((ev) => {
            const np = ev.normalized_payload;
            const raw = ev.raw_payload;
            return (
              <div key={ev.id} className="relative">
                <div className="absolute -right-[9px] top-1 w-4 h-4 rounded-full bg-zinc-700 border-2 border-zinc-900" />
                <Card className="bg-zinc-900 border-zinc-800 mr-4">
                  <CardHeader className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">{new Date(ev.occurred_at).toLocaleString("he-IL")}</span>
                      <span className="text-xs text-zinc-600">{np?.sender_name || raw?.sender_name}</span>
                      <Badge variant="outline" className="text-xs">{ev.processing_status}</Badge>
                    </div>
                    <CardTitle className="text-sm mt-1">{np?.content_text || raw?.content}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      {/* Case History */}
      {data.history.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-3">History</h3>
          <div className="space-y-2">
            {data.history.map((h, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-zinc-600 w-28 shrink-0">{new Date(h.created_at).toLocaleString("he-IL")}</span>
                <Badge variant="outline" className="text-xs shrink-0">{h.changed_by}</Badge>
                <span className="text-zinc-400">{h.field_changed}: {h.old_value} → {h.new_value}</span>
                {h.reasoning && <span className="text-zinc-600">— {h.reasoning}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
