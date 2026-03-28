"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { NgoDashboard } from "@/app/components/dashboard/ngo-dashboard";
import { fetchMe } from "@/lib/api/fetch-me";
import { supabase } from "@/lib/supabase/client";

type DashboardUser = {
  email?: string;
  displayName: string;
};

function deriveDisplayName(
  fullName: string | null | undefined,
  email?: string,
) {
  const cleanName = fullName?.trim();
  if (cleanName) {
    return cleanName;
  }

  if (email) {
    const localPart = email.split("@")[0]?.trim();
    if (localPart) {
      return localPart;
    }
  }

  return "there";
}

export default function NgoDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const me = await fetchMe(supabase);

      if (!me?.user) {
        router.replace("/login");
        return;
      }

      if (me.userType === "client") {
        router.replace("/dashboard/client");
        return;
      }

      if (me.userType !== "ngo") {
        router.replace("/");
        return;
      }

      setUser({
        email: me.user.email,
        displayName: deriveDisplayName(me.profile?.full_name, me.user.email),
      });
      setLoading(false);
    }

    void loadUser();
  }, [router]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-200">
        Loading NGO dashboard...
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 px-3 py-6 text-white sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl overflow-x-hidden">
        <header className="mb-8 flex flex-col items-start justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Image
              src="/logo/3.png"
              alt="BEACON logo"
              width={52}
              height={52}
              className="h-11 w-11 rounded-md border border-white/15 object-cover sm:h-12 sm:w-12"
            />
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-orange-300 uppercase">
                BEACON Dashboard
              </p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                Hello, {user?.displayName}
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                Signed in as {user?.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-yellow-300 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </header>

        <NgoDashboard />
      </div>
    </main>
  );
}
