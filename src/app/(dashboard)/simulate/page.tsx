"use client";

import { useState, useEffect, useCallback } from "react";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Scenario = {
  id: string;
  name: string;
  gate_type: string;
  sender_name: string;
  channel_name: string;
  content_template: string;
};

export default function SimulatePage() {
  const [gateType, setGateType] = useState("simulator");
  const [senderName, setSenderName] = useState("");
  const [channelName, setChannelName] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ event_id: string } | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioName, setSaveAs] = useState("");

  const fetchScenarios = useCallback(async () => {
    const res = await fetch(`/api/simulator/scenarios?user_id=${DEMO_USER_ID}`);
    const data = await res.json();
    if (Array.isArray(data)) setScenarios(data);
  }, []);

  useEffect(() => { fetchScenarios(); }, [fetchScenarios]);

  async function handleSend() {
    if (!content.trim()) return;
    setSending(true);
    setResult(null);
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate_type: gateType,
        sender_name: senderName || "Simulator User",
        channel_name: channelName || "Simulator Channel",
        message_content: content,
        user_id: DEMO_USER_ID,
      }),
    });
    const data = await res.json();
    setResult(data);
    setSending(false);
  }

  async function handleSaveScenario() {
    if (!scenarioName.trim() || !content.trim()) return;
    await fetch("/api/simulator/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: DEMO_USER_ID,
        name: scenarioName,
        gate_type: gateType,
        sender_name: senderName,
        channel_name: channelName,
        content_template: content,
      }),
    });
    setSaveAs("");
    fetchScenarios();
  }

  function loadScenario(sc: Scenario) {
    setGateType(sc.gate_type);
    setSenderName(sc.sender_name || "");
    setChannelName(sc.channel_name || "");
    setContent(sc.content_template);
    setResult(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Simulator Form */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-xl font-bold">Fake Channel Simulator</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Gate Type</label>
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
              value={gateType}
              onChange={(e) => setGateType(e.target.value)}
            >
              {["simulator", "whatsapp", "telegram", "slack", "generic"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Sender Name</label>
            <Input
              placeholder="David Cohen"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Channel Name</label>
          <Input
            placeholder="Project Alpha Group"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            className="bg-zinc-800 border-zinc-700"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Message Content</label>
          <Textarea
            placeholder="Type a message to simulate... (e.g., 'Payment overdue for invoice #1234')"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="bg-zinc-800 border-zinc-700 min-h-[120px]"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSend} disabled={sending || !content.trim()}>
            {sending ? "Sending..." : "Send Event"}
          </Button>
          <Button variant="outline" onClick={() => { setContent(""); setResult(null); setSenderName(""); setChannelName(""); }}>
            Reset
          </Button>
        </div>

        {result && (
          <Card className="bg-green-950/30 border-green-800">
            <CardContent className="py-3">
              <p className="text-sm text-green-400">
                Event sent! ID: <code className="text-xs">{result.event_id}</code>
              </p>
              <a href={`/events`} className="text-xs text-green-500 underline">View in Event Log →</a>
            </CardContent>
          </Card>
        )}

        {/* Save as scenario */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-zinc-500 mb-1 block">Save as Scenario</label>
            <Input
              placeholder="Scenario name..."
              value={scenarioName}
              onChange={(e) => setSaveAs(e.target.value)}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSaveScenario} disabled={!scenarioName.trim() || !content.trim()}>
            Save
          </Button>
        </div>
      </div>

      {/* Saved Scenarios sidebar */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-400">Saved Scenarios</h3>
        {scenarios.length === 0 ? (
          <p className="text-xs text-zinc-600">No saved scenarios yet.</p>
        ) : (
          scenarios.map((sc) => (
            <Card
              key={sc.id}
              className="bg-zinc-900 border-zinc-800 cursor-pointer hover:border-zinc-600"
              onClick={() => loadScenario(sc)}
            >
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{sc.gate_type}</Badge>
                  {sc.name}
                </CardTitle>
                <p className="text-xs text-zinc-600 truncate">{sc.content_template}</p>
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
