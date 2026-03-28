"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Loader2, LockKeyhole, Mail } from "lucide-react";
import { fetchMe } from "@/lib/api/fetch-me";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInData.user) {
      const me = await fetchMe(supabase);
      setLoading(false);
      setMessage("Login successful. Redirecting to your dashboard...");
      if (me?.userType === "ngo") {
        router.push("/dashboard/ngo");
        return;
      }
      if (me?.userType === "client") {
        router.push("/dashboard/client");
        return;
      }
      router.push("/dashboard");
      return;
    }

    setLoading(false);
    setError(
      signInError?.message ??
        "Invalid email or password. If you are new, please register.",
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/75 p-7 shadow-[0_0_70px_-30px_rgba(249,115,22,0.6)] sm:p-8">
        <div className="mb-4 inline-flex items-center gap-3">
          <Image
            src="/logo/3.png"
            alt="BEACON logo"
            width={48}
            height={48}
            className="h-11 w-11 rounded-md border border-white/15 object-cover"
          />
          <span className="text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase">
            Team ZeroLatency
          </span>
        </div>
        <p className="text-xs font-semibold tracking-[0.16em] text-orange-300 uppercase">
          BEACON Access
        </p>
        <h1 className="mt-2 text-3xl font-bold">Login / Registration</h1>
        <p className="mt-3 text-sm text-slate-300">
          Enter your email and password to log in. If no account exists, you
          will be redirected to registration.
        </p>

        <form className="mt-7 space-y-4" onSubmit={handleAuth}>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-slate-200">
              <Mail className="h-4 w-4 text-yellow-300" aria-hidden="true" />
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="ops@beacon.org"
              className="w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-orange-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-slate-200">
              <LockKeyhole
                className="h-4 w-4 text-yellow-300"
                aria-hidden="true"
              />
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              placeholder="Enter your password"
              className="w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-orange-400"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {loading ? "Checking account..." : "Continue"}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-300">
          New user?{" "}
          <Link
            href="/registration"
            className="font-semibold text-yellow-200 hover:text-yellow-100"
          >
            Create an account
          </Link>
        </p>

        <Link
          href="/"
          className="mt-6 inline-block text-sm text-slate-400 hover:text-white"
        >
          Back to BEACON landing page
        </Link>
      </div>
    </main>
  );
}
