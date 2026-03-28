"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type PendingRegistration = {
  email?: string;
  password?: string;
};

function getPendingRegistration(): PendingRegistration {
  if (typeof window === "undefined") {
    return {};
  }

  const storedData = sessionStorage.getItem("beacon_pending_registration");
  if (!storedData) {
    return {};
  }

  try {
    return JSON.parse(storedData) as PendingRegistration;
  } catch {
    return {};
  }
}

export default function RegistrationPage() {
  const router = useRouter();
  const pendingRegistration = getPendingRegistration();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(pendingRegistration.email ?? "");
  const [password, setPassword] = useState(pendingRegistration.password ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const normalizedFullName = fullName.trim();
    const normalizedEmail = email.trim();
    const normalizedPassword = password;

    if (!normalizedFullName) {
      setError("Name is required.");
      return;
    }

    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!normalizedPassword) {
      setError("Password is required.");
      return;
    }

    if (normalizedPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
      {
        email: normalizedEmail,
        password: normalizedPassword,
        options: {
          data: {
            full_name: normalizedFullName,
          },
        },
      },
    );

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!signUpData.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      if (signInError) {
        setError(
          "Registration was created, but auto-login failed. Please log in manually.",
        );
        return;
      }
    }

    sessionStorage.removeItem("beacon_pending_registration");
    setMessage("Registration successful. Redirecting to your dashboard...");
    setTimeout(() => {
      router.push("/dashboard/client");
    }, 600);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/75 p-7 shadow-[0_0_70px_-30px_rgba(250,204,21,0.45)] sm:p-8">
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
        <p className="text-xs font-semibold tracking-[0.16em] text-yellow-200 uppercase">
          Team ZeroLatency
        </p>
        <h1 className="mt-2 text-3xl font-bold">Registration</h1>
        <p className="mt-3 text-sm text-slate-300">
          We copied your email and password from login. Add your full name to
          complete account setup.
        </p>

        <form className="mt-7 space-y-4" onSubmit={handleRegistration}>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-slate-200">
              <UserRound
                className="h-4 w-4 text-orange-300"
                aria-hidden="true"
              />
              Full Name
            </span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              placeholder="Avery Thompson"
              className="w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-orange-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-slate-200">
              <Mail className="h-4 w-4 text-orange-300" aria-hidden="true" />
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="responder@beacon.org"
              className="w-full rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-orange-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-slate-200">
              <LockKeyhole
                className="h-4 w-4 text-orange-300"
                aria-hidden="true"
              />
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              placeholder="Create a secure password"
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
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-300">
          Already registered?{" "}
          <Link
            href="/login"
            className="font-semibold text-yellow-200 hover:text-yellow-100"
          >
            Back to login
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
