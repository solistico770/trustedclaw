import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  let query = db.from("cases")
    .select("*, case_entities(entity_id, role, entities(id, canonical_name, type))")
    .eq("user_id", userId);

  const status = sp.get("status");
  if (status) {
    const statuses = status.split(",");
    query = query.in("status", statuses);
  } else {
    // Default: non-closed
    query = query.not("status", "eq", "closed");
  }

  const sortBy = sp.get("sort_by") || "importance";
  if (sortBy === "importance") {
    query = query.order("importance_level", { ascending: false }).order("last_event_at", { ascending: false });
  } else if (sortBy === "last_activity") {
    query = query.order("last_event_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.limit(100);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
