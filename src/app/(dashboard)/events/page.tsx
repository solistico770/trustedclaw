"use client";

import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Event = {
  id: string;
  raw_payload: Record<string, string>;
  normalized_payload: Record<string, string> | null;
  processing_status: string;
  occurred_at: string;
  classifications: Array<{ severity: string; urgency: string; importance_score: number; reasoning: string }>;
  triage_decisions: Array<{ decision: string; status: string; reasoning: string }>;
};

type TraceStep = {
  actor: string;
  action_type: string;
  reasoning: string;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-zinc-600", processing: "bg-blue-600", normalized: "bg-blue-500",
  enriched: "bg-purple-500", classified: "bg-purple-600", completed: "bg-green-600",
  stuck: "bg-red-600", permanent_failure: "bg-red-700", needs_review: "bg-yellow-600",
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState<TraceStep[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchEvents = useCallback(async () => {
    const url = `/api/events?user_id=${DEMO_USER_ID}${statusFilter ? `&status=${statusFilter}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data)) setEvents(data);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  async function loadTrace(eventId: string) {
    if (selectedId === eventId) { setSelectedId(null); setSelectedTrace(null); return; }
    const res = await fetch(`/api/audit/trace/${eventId}`);
    const data = await res.json();
    setSelectedTrace(data);
    setSelectedId(eventId);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Event Log</h2>
        <select
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {["pending", "processing", "completed", "stuck", "permanent_failure", "needs_review"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-900 rounded animate-pulse" />)}</div>
      ) : events.length === 0 ? (
        <p className="text-zinc-500">No events yet. Use the Simulator to create some!</p>
      ) : (
        events.map((ev) => {
          const cls = ev.classifications?.[0];
          const triage = ev.triage_decisions?.[0];
          const raw = ev.raw_payload;
          const np = ev.normalized_payload;

          return (
            <Card
              key={ev.id}
              className="bg-zinc-900 border-zinc-800 cursor-pointer hover:border-zinc-600 transition"
              onClick={() => loadTrace(ev.id)}
            >
              <CardHeader className="py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`${STATUS_COLORS[ev.processing_status] || "bg-zinc-600"} text-white text-xs`}>
                    {ev.processing_status}
                  </Badge>
                  {cls && <Badge variant="outline" className="text-xs">{cls.severity}/{cls.urgency}</Badge>}
                  {triage && <Badge variant="secondary" className="text-xs">{triage.decision}</Badge>}
                  <span className="text-xs text-zinc-500">{raw?.gate_type || "?"}</span>
                  <span className="text-xs text-zinc-600 mr-auto">{new Date(ev.occurred_at).toLocaleString("he-IL")}</span>
                </div>
                <CardTitle className="text-sm mt-1">{np?.content_text || raw?.content || ev.id.slice(0, 8)}</CardTitle>
              </CardHeader>

              {selectedId === ev.id && selectedTrace && (
                <CardContent className="border-t border-zinc-800 pt-3">
                  <p className="text-xs text-zinc-500 mb-2 font-bold">Decision Trace</p>
                  <div className="space-y-2">
                    {selectedTrace.map((step, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <span className="text-zinc-600 w-16 shrink-0">{new Date(step.created_at).toLocaleTimeString("he-IL")}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{step.action_type}</Badge>
                        <span className="text-zinc-400 truncate">{step.reasoning}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
