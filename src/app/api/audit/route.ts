import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  let query = db.from("audit_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  const actor = sp.get("actor");
  if (actor) query = query.eq("actor", actor);

  const actionType = sp.get("action_type");
  if (actionType) query = query.eq("action_type", actionType);

  const dateFrom = sp.get("date_from");
  if (dateFrom) query = query.gte("created_at", dateFrom);

  const dateTo = sp.get("date_to");
  if (dateTo) query = query.lte("created_at", dateTo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
