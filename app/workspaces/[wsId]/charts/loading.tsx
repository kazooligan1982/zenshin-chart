export default function ChartsLoading() {
  return (
    <div className="min-h-screen bg-zenshin-cream animate-pulse">
      <div className="max-w-7xl mx-auto py-10 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="h-9 w-32 bg-zenshin-navy/10 rounded-lg" />
            <div className="h-4 w-48 bg-zenshin-navy/8 rounded mt-2" />
          </div>
          <div className="h-10 w-32 bg-zenshin-navy/10 rounded-lg" />
        </div>

        {/* Recent Activity */}
        <section className="mb-12">
          <div className="h-4 w-36 bg-zenshin-navy/8 rounded mb-5" />
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="shrink-0 w-[280px] h-[140px] bg-white/60 rounded-2xl border border-zenshin-navy/8"
              />
            ))}
          </div>
        </section>

        {/* All Charts */}
        <section>
          <div className="h-4 w-28 bg-zenshin-navy/8 rounded mb-6" />
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[100px] bg-white/60 rounded-2xl border border-zenshin-navy/8"
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
