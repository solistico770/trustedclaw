"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HeartbeatLog = {
  id: string;
  run_id: string;
  triggered_by: string;
  run_at: string;
  duration_ms: number;
  events_checked: number;
  events_requeued: number;
  events_stuck: number;
  escalations_reminded: number;
  status: string;
  error_message: string | null;
};

export default function HeartbeatPage() {
  const [logs, setLogs] = useState<HeartbeatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/heartbeat/logs?user_id=${DEMO_USER_ID}`);
    const data = await res.json();
    if (Array.isArray(data)) setLogs(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("heartbeat-monitor")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "heartbeat_logs",
      }, () => fetchLogs())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLogs]);

  async function runManual() {
    setRunning(true);
    await fetch("/api/heartbeat/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID }),
    });
    await fetchLogs();
    setRunning(false);
  }

  const latest = logs[0];
  const isHealthy = latest?.status === "success";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Heartbeat Monitor</h2>
        <Button onClick={runManual} disabled={running} size="sm" variant={isHealthy ? "outline" : "destructive"}>
          {running ? "Running..." : "הרץ עכשיו"}
        </Button>
      </div>

      {/* Status card */}
      <Card className={`border ${isHealthy ? "border-green-800 bg-green-950/30" : latest ? "border-red-800 bg-red-950/30" : "border-zinc-800 bg-zinc-900"}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${isHealthy ? "bg-green-500" : latest ? "bg-red-500" : "bg-zinc-500"}`} />
            {isHealthy ? "פעיל" : latest ? "כשל" : "לא רץ עדיין"}
          </CardTitle>
        </CardHeader>
        {latest && (
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-zinc-500">ריצה אחרונה</p>
              <p>{new Date(latest.run_at).toLocaleString("he-IL")}</p>
            </div>
            <div>
              <p className="text-zinc-500">משך</p>
              <p>{latest.duration_ms}ms</p>
            </div>
            <div>
              <p className="text-zinc-500">אירועים שנבדקו</p>
              <p>{latest.events_checked}</p>
            </div>
            <div>
              <p className="text-zinc-500">הוחזרו לתור</p>
              <p>{latest.events_requeued}</p>
            </div>
          </CardContent>
        )}
        {latest?.error_message && (
          <CardContent className="pt-0">
            <p className="text-red-400 text-xs font-mono bg-red-950/50 p-2 rounded">{latest.error_message}</p>
          </CardContent>
        )}
      </Card>

      {/* History table */}
      <div className="rounded-lg border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900">
            <tr className="text-zinc-500 text-right">
              <th className="p-3">זמן</th>
              <th className="p-3">מקור</th>
              <th className="p-3">משך</th>
              <th className="p-3">נבדקו</th>
              <th className="p-3">הוחזרו</th>
              <th className="p-3">תקועים</th>
              <th className="p-3">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-4 text-center text-zinc-600">טוען...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-zinc-600">אין ריצות heartbeat עדיין</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="p-3 text-xs">{new Date(log.run_at).toLocaleString("he-IL")}</td>
                  <td className="p-3"><Badge variant="outline" className="text-xs">{log.triggered_by}</Badge></td>
                  <td className="p-3">{log.duration_ms}ms</td>
                  <td className="p-3">{log.events_checked}</td>
                  <td className="p-3">{log.events_requeued}</td>
                  <td className="p-3">{log.events_stuck}</td>
                  <td className="p-3">
                    <Badge className={`${log.status === "success" ? "bg-green-700" : "bg-red-700"} text-white text-xs`}>
                      {log.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
