"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchMe } from "@/lib/api/fetch-me";
import { supabase } from "@/lib/supabase/client";

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const me = await fetchMe(supabase);

      if (!me?.user) {
        router.replace("/login");
        return;
      }

      if (me.userType === "ngo") {
        router.replace("/dashboard/ngo");
        return;
      }

      if (me.userType === "client") {
        router.replace("/dashboard/client");
        return;
      }

      setForbidden(true);
      setLoading(false);
      return;
    }

    void loadUser();
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-200">
        Redirecting to your dashboard...
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-200">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-center">
          <p className="text-xs font-semibold tracking-[0.16em] text-orange-300 uppercase">
            Restricted Access
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">Access denied</h1>
          <p className="mt-3 text-sm text-slate-300">
            This dashboard is only available to NGO and client accounts.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-5 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-yellow-300 hover:text-yellow-200"
          >
            Back to home
          </button>
        </div>
      </main>
    );
  }

  return null;
}
