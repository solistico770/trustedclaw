import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  const { data, error } = await db.from("policies")
    .select("*")
    .eq("user_id", userId)
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const active = data?.find((p) => p.is_active) || null;
  return NextResponse.json({ active, versions: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, rules } = body;
  if (!user_id || !rules) return NextResponse.json({ error: "user_id and rules required" }, { status: 400 });

  const db = createServiceClient();

  // Deactivate current
  await db.from("policies").update({ is_active: false }).eq("user_id", user_id).eq("is_active", true);

  // Get next version number
  const { data: latest } = await db.from("policies")
    .select("version")
    .eq("user_id", user_id)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version || 0) + 1;

  const { data, error } = await db.from("policies").insert({
    user_id,
    version: nextVersion,
    rules,
    is_active: true,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
