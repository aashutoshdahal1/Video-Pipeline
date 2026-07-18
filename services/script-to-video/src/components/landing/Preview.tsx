import { ArrowRight } from "lucide-react";

export function Preview() {
  const before = `A young entrepreneur opens her laptop in a bustling coffee shop. She smiles as a notification pops up — her startup just hit a million users. The city lights twinkle through the window.`;
  const clips = [
    { src: "1495474472287-4d71bcdd2085", tag: "coffee shop" },
    { src: "1498050108023-c5249f4df085", tag: "laptop" },
    { src: "1529156069898-49953e39b3ac", tag: "smile" },
    { src: "1449824913935-59a10b8d2000", tag: "city lights" },
  ];

  return (
    <section id="preview" className="relative overflow-hidden border-y border-border/60 bg-secondary/30 py-24">
      <div className="absolute inset-0 -z-10 mesh-bg opacity-50" />
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">See it in action</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">From paragraph to perfect clips</h2>
          <p className="mt-4 text-muted-foreground">One script in. A curated set of cinematic videos out.</p>
        </div>

        <div className="mt-14 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Before — your script</div>
            <p className="leading-relaxed text-foreground/80">{before}</p>
          </div>

          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="mb-3 px-2 text-xs font-semibold uppercase text-muted-foreground">After — matched clips</div>
            <div className="grid grid-cols-2 gap-3">
              {clips.map((c) => (
                <div key={c.src} className="group relative overflow-hidden rounded-xl">
                  <img src={`https://images.unsplash.com/photo-${c.src}?auto=format&fit=crop&w=400&h=240&q=70`} alt={c.tag} loading="lazy" className="aspect-video w-full object-cover transition-transform group-hover:scale-110" />
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white backdrop-blur">#{c.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}