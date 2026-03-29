import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  let query = db.from("entities").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);

  const q = sp.get("q");
  if (q) query = query.ilike("canonical_name", `%${q}%`);

  const type = sp.get("type");
  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
