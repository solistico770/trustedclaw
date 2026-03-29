import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const db = createServiceClient();

  const { data: logs, error } = await db.from("audit_logs")
    .select("*")
    .eq("target_id", eventId)
    .eq("target_type", "event")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(logs);
}
