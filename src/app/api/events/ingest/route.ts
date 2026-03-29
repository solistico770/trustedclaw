import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { runPipeline } from "@/lib/pipeline";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gate_type, sender_name, channel_name, content, simulated_timestamp, user_id } = body;

    if (!content || !user_id) {
      return NextResponse.json({ error: "Missing required fields: content, user_id" }, { status: 400 });
    }

    const db = createServiceClient();

    // Find or create gate
    let gateId: string | null = null;
    const gType = gate_type || "generic";
    const { data: existingGate } = await db.from("gates")
      .select("id").eq("user_id", user_id).eq("type", gType).limit(1).single();

    if (existingGate) {
      gateId = existingGate.id;
    } else {
      const { data: newGate } = await db.from("gates").insert({
        user_id, type: gType, display_name: gType.charAt(0).toUpperCase() + gType.slice(1), status: "active",
      }).select("id").single();
      gateId = newGate?.id || null;
    }

    // Find or create channel
    let channelId: string | null = null;
    const chName = channel_name || "Default";
    if (gateId) {
      const { data: existingChannel } = await db.from("channels")
        .select("id").eq("gate_id", gateId).eq("display_name", chName).eq("user_id", user_id).limit(1).single();

      if (existingChannel) {
        channelId = existingChannel.id;
        await db.from("channels").update({ last_activity_at: new Date().toISOString() }).eq("id", channelId);
      } else {
        const { data: newChannel } = await db.from("channels").insert({
          gate_id: gateId, user_id, display_name: chName, external_channel_id: chName,
        }).select("id").single();
        channelId = newChannel?.id || null;
      }
    }

    // Save raw event synchronously
    const { data: event, error } = await db.from("events").insert({
      gate_id: gateId,
      channel_id: channelId,
      user_id,
      occurred_at: simulated_timestamp || new Date().toISOString(),
      received_at: new Date().toISOString(),
      raw_payload: { gate_type: gType, sender_name, channel_name: chName, content, simulated_timestamp },
      processing_status: "pending",
    }).select("id").single();

    if (error || !event) {
      return NextResponse.json({ error: "Failed to save event" }, { status: 503 });
    }

    await logAudit(db, {
      user_id, actor: "system", action_type: "ingest",
      target_type: "event", target_id: event.id, reasoning: `Ingested from ${gType}/${chName}`,
    });

    // Run pipeline synchronously
    try {
      await runPipeline(db, event.id, user_id);
    } catch (e) {
      console.error("[ingest] pipeline error:", e);
    }

    // Get final status + case_id
    const { data: final } = await db.from("events").select("processing_status, case_id").eq("id", event.id).single();

    return NextResponse.json({
      event_id: event.id,
      case_id: final?.case_id || null,
      processing_status: final?.processing_status || "pending",
    });
  } catch (e) {
    console.error("[ingest] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
