"use client";

import { Sidebar } from "@/components/sidebar";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { DEMO_USER_ID } from "@/lib/constants";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [escalationCount, setEscalationCount] = useState(0);
  const supabase = createBrowserClient();

  useEffect(() => {
    // Fetch initial count
    async function fetchCount() {
      const { count } = await supabase
        .from("cases")
        .select("*", { count: "exact", head: true })
        .eq("user_id", DEMO_USER_ID)
        .in("status", ["open", "action_needed", "escalated"]);
      setEscalationCount(count || 0);
    }
    fetchCount();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("escalation-count")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "cases",
      }, () => {
        fetchCount();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white" dir="rtl">
      <div className="flex-1 overflow-auto">
        <main className="p-6 max-w-6xl mx-auto">{children}</main>
      </div>
      <Sidebar escalationCount={escalationCount} />
    </div>
  );
}
