"use client";

import { useEffect, useState, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Entity = {
  id: string;
  type: string;
  canonical_name: string;
  aliases: string[];
  auto_created: boolean;
  created_at: string;
};

type TimelineItem = {
  event_id: string;
  role: string;
  confidence_score: number;
  events: {
    id: string;
    raw_payload: Record<string, string>;
    occurred_at: string;
    processing_status: string;
    classifications: Array<{ severity: string }>;
  };
};

const TYPE_COLORS: Record<string, string> = {
  person: "bg-blue-600", company: "bg-purple-600", project: "bg-green-600",
  invoice: "bg-yellow-600", other: "bg-zinc-600", unknown: "bg-zinc-700",
};

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);

  const fetchEntities = useCallback(async () => {
    const url = `/api/entities?user_id=${DEMO_USER_ID}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data)) setEntities(data);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(fetchEntities, 300);
    return () => clearTimeout(timer);
  }, [fetchEntities]);

  async function loadTimeline(entityId: string) {
    if (selectedEntity === entityId) { setSelectedEntity(null); return; }
    const res = await fetch(`/api/entities/${entityId}`);
    const data = await res.json();
    setTimeline(data.timeline || []);
    setSelectedEntity(entityId);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Entity Browser</h2>
      <Input
        placeholder="חיפוש לפי שם..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="bg-zinc-800 border-zinc-700 max-w-sm"
      />

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-900 rounded animate-pulse" />)}</div>
      ) : entities.length === 0 ? (
        <p className="text-zinc-500">No entities found.</p>
      ) : (
        entities.map((ent) => (
          <Card key={ent.id} className="bg-zinc-900 border-zinc-800 cursor-pointer hover:border-zinc-600" onClick={() => loadTimeline(ent.id)}>
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <Badge className={`${TYPE_COLORS[ent.type] || "bg-zinc-600"} text-white text-xs`}>{ent.type}</Badge>
                <CardTitle className="text-sm">{ent.canonical_name}</CardTitle>
                {ent.auto_created && <Badge variant="outline" className="text-xs text-zinc-500">auto</Badge>}
                {ent.aliases?.length > 0 && <span className="text-xs text-zinc-600">aliases: {ent.aliases.join(", ")}</span>}
              </div>
            </CardHeader>

            {selectedEntity === ent.id && (
              <CardContent className="border-t border-zinc-800 pt-3 space-y-2">
                <p className="text-xs text-zinc-500 font-bold">Timeline ({timeline.length} events)</p>
                {timeline.map((item, i) => (
                  <div key={i} className="flex gap-2 text-xs items-center">
                    <span className="text-zinc-600 w-28 shrink-0">{new Date(item.events?.occurred_at).toLocaleString("he-IL")}</span>
                    <Badge variant="outline" className="text-xs">{item.role}</Badge>
                    <span className="text-zinc-400 truncate">{item.events?.raw_payload?.content || item.events?.id?.slice(0, 8)}</span>
                  </div>
                ))}
                {timeline.length === 0 && <p className="text-xs text-zinc-600">No events linked.</p>}
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
