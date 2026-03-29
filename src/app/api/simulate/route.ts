import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { gate_type, sender_name, channel_name, message_content, simulated_timestamp, user_id } = body;

  if (!message_content || !user_id) {
    return NextResponse.json({ error: "Missing required: message_content, user_id" }, { status: 400 });
  }

  // Forward to ingest with simulator gate type
  const ingestUrl = new URL("/api/events/ingest", req.url);
  const res = await fetch(ingestUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gate_type: gate_type || "simulator",
      sender_name: sender_name || "Simulator User",
      channel_name: channel_name || "Simulator",
      content: message_content,
      simulated_timestamp,
      user_id,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
