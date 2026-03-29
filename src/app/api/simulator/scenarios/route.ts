import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  const { data, error } = await db.from("simulator_scenarios")
    .select("*").eq("user_id", userId).order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, name, gate_type, sender_name, channel_name, content_template } = body;
  if (!user_id || !name || !content_template) {
    return NextResponse.json({ error: "user_id, name, content_template required" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db.from("simulator_scenarios").insert({
    user_id, name, gate_type: gate_type || "generic", sender_name, channel_name, content_template,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
