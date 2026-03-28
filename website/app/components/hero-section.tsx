import Image from "next/image";
import { ArrowRight, RadioTower, Radar } from "lucide-react";
import { FadeInSection } from "./fade-in-section";

export function HeroSection() {
  return (
    <FadeInSection
      className="relative overflow-hidden px-4 pt-16 pb-14 sm:px-6 sm:pt-20 sm:pb-18 lg:px-8 lg:pt-24 lg:pb-20"
      delay={0.05}
    >
      <div className="beacon-glow pointer-events-none absolute -top-40 right-[-12%] h-72 w-72 rounded-full sm:right-0 sm:h-80 sm:w-80" />
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-2 lg:items-end lg:gap-12">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-300/40 bg-yellow-300/10 px-4 py-1 text-xs font-semibold tracking-[0.18em] text-yellow-200 uppercase">
            Team ZeroLatency
          </p>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
            BEACON
          </h1>
          <p className="mt-3 text-lg font-semibold text-orange-400 sm:mt-4 sm:text-2xl">
            When Networks Fail, We Don&apos;t.
          </p>
          <p className="mt-5 max-w-xl text-sm leading-7 text-slate-200 sm:mt-6 sm:text-lg">
            Team ZeroLatency is driven by speed, precision, and innovation. We
            build real-time, efficient, and impactful solutions that solve
            problems instantly. We don&apos;t just create ideas - we execute
            them at the speed of now.
          </p>

          <div className="mt-6 max-w-48 overflow-hidden rounded-xl border border-white/10 bg-slate-900/80 p-2 sm:max-w-55">
            <Image
              src="/logo/3.png"
              alt="BEACON logo"
              width={240}
              height={240}
              className="h-24 w-full rounded-lg object-cover sm:h-28"
            />
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-4">
            <a
              href="#solution"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-400 sm:w-auto"
            >
              Explore the Mesh{" "}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href="#impact"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:border-yellow-300 hover:text-yellow-200 sm:w-auto"
            >
              View Dashboard Demo{" "}
              <Radar className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-linear-to-br from-slate-900 via-slate-900 to-slate-800 p-5 shadow-[0_0_80px_-25px_rgba(249,115,22,0.45)] sm:p-6">
          <p className="mb-4 text-sm font-semibold tracking-[0.18em] text-slate-300 uppercase">
            Live Response Window
          </p>
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-sm text-slate-300">Mesh Health</p>
              <p className="mt-1 text-2xl font-bold text-yellow-200 sm:text-3xl">
                94% Active
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-sm text-slate-300">SOS Relays</p>
                <p className="mt-1 text-2xl font-bold text-white">1,284</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-sm text-slate-300">Avg. Relay Time</p>
                <p className="mt-1 text-2xl font-bold text-white">2.4s</p>
              </div>
            </div>
            <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 p-4 text-sm text-orange-100">
              <p className="inline-flex items-center gap-2 font-semibold">
                <RadioTower className="h-4 w-4" aria-hidden="true" />
                Offline nodes keep routing signals despite tower outages.
              </p>
            </div>
          </div>
        </div>
      </div>
    </FadeInSection>
  );
}
