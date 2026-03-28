import { FadeInSection } from "./fade-in-section";

export function FooterSection() {
  return (
    <FadeInSection className="px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12 lg:px-8" delay={0.28}>
      <footer className="mx-auto w-full max-w-6xl border-t border-white/10 pt-6 sm:pt-8">
        <p className="text-base font-semibold text-white sm:text-lg">
          Because communication shouldn&apos;t die first.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Built by Team ZeroLatency.
        </p>
      </footer>
    </FadeInSection>
  );
}
