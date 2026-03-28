import {
  BluetoothConnected,
  Database,
  MessageSquareMore,
  MonitorCog,
  Smartphone,
} from "lucide-react";
import { FadeInSection } from "./fade-in-section";

const stack = [
  {
    title: "Mobile App",
    description: "React Native (Expo), Offline data caching.",
    icon: Smartphone,
  },
  {
    title: "Web Dashboard",
    description: "Next.js + Tailwind CSS, High-performance UI.",
    icon: MonitorCog,
  },
  {
    title: "Backend & DB",
    description: "Supabase (PostgreSQL), Edge functions.",
    icon: Database,
  },
  {
    title: "Mesh Layer",
    description: "Google Nearby Connections API, Bluetooth Low Energy.",
    icon: BluetoothConnected,
  },
  {
    title: "SMS Fallback",
    description: "Twilio API integration.",
    icon: MessageSquareMore,
  },
];

export function TechStackSection() {
  return (
    <FadeInSection
      id="stack"
      className="px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
      delay={0.2}
    >
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-2xl font-bold text-white sm:text-4xl">
          Tech Stack
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
          Beacon is powered by a resilient, layered architecture designed for
          real-world emergency conditions.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2 lg:grid-cols-3">
          {stack.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="rounded-xl border border-white/10 bg-slate-900/70 p-5"
              >
                <Icon className="h-5 w-5 text-yellow-200" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-semibold text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {item.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </FadeInSection>
  );
}
