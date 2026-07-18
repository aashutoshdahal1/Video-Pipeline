import { Brain, FileText, Film, Layers, Sparkles, Zap } from "lucide-react";

const features = [
  { icon: FileText, title: "Script-to-video matching", desc: "Paste any script. We break it into scenes and find the perfect clip for each." },
  { icon: Brain, title: "AI keyword extraction", desc: "Smart NLP pulls visual concepts from your text — no tagging required." },
  { icon: Film, title: "Pexels + Pixabay built-in", desc: "Access millions of free, royalty-free stock videos from trusted libraries." },
  { icon: Layers, title: "Scene-based timeline", desc: "Organized by scene with drag-and-drop replacements at any moment." },
  { icon: Zap, title: "Instant generation", desc: "Get your full video board in under 10 seconds. No waiting in queues." },
  { icon: Sparkles, title: "Save & reuse library", desc: "Build a personal collection of clips you love and reuse across projects." },
];

export function Features() {
  return (
    <section id="features" className="container py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Features</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">Everything you need to go from script to screen</h2>
        <p className="mt-4 text-muted-foreground">Built for creators, marketers, and storytellers who move fast.</p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={f.title}
            style={{ animationDelay: `${i * 0.07}s` }}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-card transition-smooth hover:-translate-y-1 hover:border-primary/30 hover:shadow-glow animate-fade-in-up"
          >
            <div className="absolute inset-0 -z-10 bg-gradient-vibrant opacity-0 blur-2xl transition-opacity group-hover:opacity-10" />
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}