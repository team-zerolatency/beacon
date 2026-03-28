import { FadeInSection } from "./fade-in-section";

const points = [
  { users: "50 Users", coverage: "18%", width: "w-[18%]" },
  { users: "200 Users", coverage: "44%", width: "w-[44%]" },
  { users: "500 Users", coverage: "71%", width: "w-[71%]" },
  { users: "1,000 Users", coverage: "92%", width: "w-[92%]" },
];

export function ImpactSection() {
  return (
    <FadeInSection
      id="impact"
      className="px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
      delay={0.24}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-2xl font-bold text-white sm:text-4xl">
            Impact & Scalability
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
            Beacon scales naturally. More Users = Stronger Signal. Even a small
            cluster of active devices creates a life-saving communication chain.
          </p>

          <h3 className="mt-8 text-sm font-semibold tracking-[0.16em] text-orange-300 uppercase">
            Network Reach vs. Signal Coverage
          </h3>
          <div className="mt-4 space-y-3">
            {points.map((point) => (
              <div key={point.users}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                  <span>{point.users}</span>
                  <span>{point.coverage}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-700">
                  <div
                    className={`h-full rounded-full bg-linear-to-r from-yellow-300 via-orange-400 to-orange-500 ${point.width}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold text-white">
            Offline Mapping Snapshot
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            Stylized incident map placeholder representing locally cached zones.
          </p>

          <div className="map-grid mt-6 h-56 rounded-xl border border-white/10 bg-slate-950/80 p-3 sm:h-72">
            <div className="relative h-full w-full overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(249,115,22,0.15),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(253,224,71,0.12),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,41,59,0.95))]">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-size-[24px_24px]" />
              <div className="absolute left-[12%] top-[28%] h-3 w-3 rounded-full bg-orange-400 shadow-[0_0_18px_3px_rgba(251,146,60,0.6)]" />
              <div className="absolute left-[45%] top-[50%] h-3 w-3 rounded-full bg-yellow-300 shadow-[0_0_18px_3px_rgba(253,224,71,0.65)]" />
              <div className="absolute left-[72%] top-[35%] h-3 w-3 rounded-full bg-orange-300 shadow-[0_0_18px_3px_rgba(253,186,116,0.65)]" />
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M12,28 C30,32 37,47 45,50 C57,53 66,38 72,35"
                  fill="none"
                  stroke="rgba(251,146,60,0.85)"
                  strokeWidth="0.8"
                  strokeDasharray="2 1.5"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </FadeInSection>
  );
}
