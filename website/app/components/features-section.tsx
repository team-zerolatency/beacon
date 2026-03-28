import { Accessibility, Bell, Map, Network, Radio } from "lucide-react";
import { FadeInSection } from "./fade-in-section";

const features = [
  {
    title: "One-Tap SOS",
    description: "Quick, reliable distress signaling.",
    icon: Bell,
  },
  {
    title: "Phone-to-Phone Mesh",
    description:
      "Uses Bluetooth Low Energy to relay signals across nearby devices.",
    icon: Network,
  },
  {
    title: "Infrastructure Independent",
    description: "Works without internet or cellular towers.",
    icon: Radio,
  },
  {
    title: "Inclusive & Scalable",
    description:
      "Supports smartphones via mesh and feature phones via SMS fallback.",
    icon: Accessibility,
  },
  {
    title: "Offline Mapping",
    description:
      "Caches local map tiles to visualize disaster zones without internet.",
    icon: Map,
  },
];

export function FeaturesSection() {
  return (
    <FadeInSection
      id="features"
      className="px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
      delay={0.18}
    >
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-2xl font-bold text-white sm:text-4xl">
          Key Features
        </h2>
        <div className="mt-7 grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="group rounded-xl border border-white/10 bg-slate-900/70 p-5 transition hover:-translate-y-1 hover:border-orange-400/50"
              >
                <Icon className="h-5 w-5 text-orange-300" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </FadeInSection>
  );
}
