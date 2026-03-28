import { FeaturesSection } from "./components/features-section";
import { FooterSection } from "./components/footer-section";
import { HeroSection } from "./components/hero-section";
import { ImpactSection } from "./components/impact-section";
import { Navbar } from "./components/navbar";
import { ProblemSection } from "./components/problem-section";
import { SolutionSection } from "./components/solution-section";
import { TechStackSection } from "./components/tech-stack-section";

export default function Home() {
  return (
    <div
      id="top"
      className="relative min-h-screen overflow-x-clip bg-slate-950 text-white"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-orange-500/10 via-transparent to-transparent" />
      <Navbar />
      <main className="relative">
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <TechStackSection />
        <ImpactSection />
      </main>
      <FooterSection />
    </div>
  );
}
