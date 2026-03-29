"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Escalation = {
  id: string;
  event_id: string;
  reasoning: string;
  created_at: string;
  reminded: boolean;
  events: {
    id: string;
    raw_payload: Record<string, string>;
    normalized_payload: Record<string, string> | null;
    enrichment_data: Record<string, unknown> | null;
    occurred_at: string;
    classifications: Array<{
      severity: string;
      urgency: string;
      importance_score: number;
      reasoning: string;
    }>;
    event_entities: Array<{
      entities: { canonical_name: string; type: string };
    }>;
  };
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  info: "bg-zinc-500",
};

const GATE_ICONS: Record<string, string> = {
  simulator: "🧪",
  whatsapp: "💬",
  telegram: "✈️",
  slack: "💼",
  generic: "📨",
};

export default function InboxPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEscalations = useCallback(async () => {
    const res = await fetch(`/api/escalations?user_id=${DEMO_USER_ID}`);
    const data = await res.json();
    if (Array.isArray(data)) setEscalations(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEscalations();
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "triage_decisions",
      }, () => fetchEscalations())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchEscalations]);

  async function handleResolve(id: string, decision: string, snoozeHours?: number) {
    await fetch(`/api/escalations/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        user_id: DEMO_USER_ID,
        snooze_until: snoozeHours ? new Date(Date.now() + snoozeHours * 60 * 60 * 1000).toISOString() : undefined,
      }),
    });
    setEscalations((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) {
    return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-zinc-900 rounded-lg animate-pulse" />)}</div>;
  }

  if (escalations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <div className="text-4xl mb-4">✅</div>
        <p className="text-lg">הכל תחת שליטה</p>
        <p className="text-sm">אין פריטים הדורשים תשומת לבך כרגע</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Escalation Inbox ({escalations.length})</h2>
      {escalations.map((esc) => {
        const cls = esc.events?.classifications?.[0];
        const raw = esc.events?.raw_payload;
        const np = esc.events?.normalized_payload;
        const gateType = raw?.gate_type || "generic";
        const severity = cls?.severity || "medium";

        return (
          <Card key={esc.id} className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg">{GATE_ICONS[gateType] || "📨"}</span>
                <Badge className={`${SEVERITY_COLORS[severity]} text-white`}>{severity}</Badge>
                <span className="text-sm text-zinc-400">{np?.sender_name || raw?.sender_name || "Unknown"}</span>
                <span className="text-xs text-zinc-600 mr-auto">{new Date(esc.events?.occurred_at).toLocaleString("he-IL")}</span>
                {esc.reminded && <Badge variant="outline" className="text-yellow-400 border-yellow-400">Reminded</Badge>}
              </div>
              <CardTitle className="text-base mt-1 leading-relaxed">
                {np?.content_text || raw?.content || "No content"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cls?.reasoning && (
                <p className="text-xs text-zinc-400 mb-3">{cls.reasoning}</p>
              )}
              {esc.events?.event_entities?.length > 0 && (
                <div className="flex gap-1 mb-3 flex-wrap">
                  {esc.events.event_entities.map((ee, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {ee.entities?.canonical_name} ({ee.entities?.type})
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleResolve(esc.id, "approve")} className="bg-green-700 hover:bg-green-600">
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleResolve(esc.id, "dismiss")}>
                  Dismiss
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleResolve(esc.id, "snooze", 4)} className="text-zinc-400">
                  Snooze 4h
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
