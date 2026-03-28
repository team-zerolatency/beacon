import { Bluetooth, Link2Off } from "lucide-react";
import { FadeInSection } from "./fade-in-section";

export function SolutionSection() {
  return (
    <FadeInSection
      id="solution"
      className="px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
      delay={0.14}
    >
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-orange-400/25 bg-linear-to-r from-orange-500/10 via-slate-900 to-slate-900 p-5 sm:p-8">
        <h2 className="text-2xl font-bold text-white sm:text-4xl">
          Our Solution: The Offline Mesh
        </h2>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-200 sm:mt-5 sm:text-base">
          Beacon is a fully offline disaster communication system. It transforms
          nearby smartphones into a decentralized mesh network using Bluetooth.
          SOS signals travel phone-to-phone until they reach rescue teams.
        </p>
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-xs font-semibold tracking-wide text-orange-200 sm:mt-6 sm:px-5 sm:text-sm">
          <Link2Off className="h-4 w-4" aria-hidden="true" />
          No internet. No towers. Just connection through proximity.
          <Bluetooth className="h-4 w-4" aria-hidden="true" />
        </p>
      </div>
    </FadeInSection>
  );
}
