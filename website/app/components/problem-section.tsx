import { AlertTriangle, Signal, Smartphone, WifiOff } from "lucide-react";
import { FadeInSection } from "./fade-in-section";

const issues = [
  "Cell towers and network infrastructure fail",
  "Internet connectivity disappears",
  "Emergency apps stop functioning",
  "Survivors cannot send SOS signals",
  "Rescue teams lose real-time location data",
];

const icons = [Signal, WifiOff, Smartphone, AlertTriangle, Signal];

export function ProblemSection() {
  return (
    <FadeInSection
      id="problem"
      className="px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
      delay={0.1}
    >
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-2xl font-bold text-white sm:text-4xl">
          The Problem: &quot;In Disasters, Silence Costs Lives.&quot;
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:mt-5 sm:text-base">
          When disasters (earthquakes, floods, cyclones) strike, communication
          dies first.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2 lg:grid-cols-3">
          {issues.map((item, index) => {
            const Icon = icons[index];
            return (
              <div
                key={item}
                className="rounded-xl border border-white/10 bg-slate-900/70 p-4"
              >
                <Icon className="h-5 w-5 text-orange-400" aria-hidden="true" />
                <p className="mt-3 text-sm leading-6 text-slate-100">{item}</p>
              </div>
            );
          })}
        </div>

        <p className="mt-7 rounded-xl border border-yellow-300/35 bg-yellow-300/10 p-4 text-sm font-medium leading-7 text-yellow-100 sm:mt-8 sm:p-5 sm:text-base">
          Modern disaster relief systems are built on one fragile assumption -
          that internet connectivity will always be available.
        </p>
      </div>
    </FadeInSection>
  );
}
