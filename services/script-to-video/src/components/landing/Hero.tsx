import { Link } from "react-router-dom";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroBg from "@/assets/hero-bg.jpg";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <img src={heroBg} alt="" width={1920} height={1080} className="h-full w-full object-cover opacity-40 dark:opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />
        <div className="absolute inset-0 grid-bg opacity-40" />
      </div>

      <div className="container relative flex flex-col items-center py-24 text-center md:py-36">
        <div className="inline-flex items-center gap-2 rounded-full border border-border glass px-4 py-1.5 text-xs font-medium text-muted-foreground animate-fade-in">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI-powered script-to-video sourcing
          <span className="ml-2 rounded-full bg-gradient-vibrant px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>
        </div>

        <h1 className="mt-8 max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl animate-fade-in-up">
          Turn Scripts into <br className="hidden md:block" />
          <span className="gradient-text">Stock Videos</span> Instantly
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg animate-fade-in-up">
          Paste any script and our AI finds matching clips from Pexels & Pixabay.
          Build cinematic videos in minutes — no editor, no manual searching.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row animate-fade-in-up">
          <Button asChild size="lg" className="h-12 bg-gradient-primary px-7 text-base font-semibold text-primary-foreground shadow-glow hover:opacity-95">
            <Link to="/app">
              Start Free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base font-semibold glass">
            <Link to="/app/new">
              <Play className="mr-2 h-4 w-4 fill-current" /> Try Demo
            </Link>
          </Button>
        </div>

        <div className="mt-12 flex items-center gap-8 text-xs text-muted-foreground animate-fade-in">
          <div>⭐ 4.9 / 5 from 1,200+ creators</div>
          <div className="hidden sm:block">🎬 2M+ clips matched</div>
          <div className="hidden md:block">🔓 Free tier — no credit card</div>
        </div>

        {/* Floating preview card */}
        <div className="relative mt-16 w-full max-w-5xl animate-fade-in-up">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-vibrant opacity-30 blur-3xl animate-glow-pulse" />
          <div className="relative overflow-hidden rounded-2xl border border-border glass-strong shadow-glow">
            <div className="flex items-center gap-1.5 border-b border-border/60 bg-secondary/50 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
              <span className="ml-3 text-xs text-muted-foreground">script2video.ai / app</span>
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-[1fr_2fr]">
              <div className="rounded-xl border border-border bg-background/60 p-4 text-left text-sm">
                <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Your script</div>
                <p className="text-foreground/80">"A drone glides over misty mountains as the sun rises. The city wakes up below…"</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["mountains", "sunrise", "city", "drone"].map((t) => (
                    <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">#{t}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["1464822759023-fed622ff2c3b", "1483728642387-6c3bdd6c93e5", "1542051841857-5f90071e7989", "1473580044384-7ba9967e16a0", "1441974231531-c6227db76b6e", "1449824913935-59a10b8d2000"].map((s, i) => (
                  <div key={s} style={{ animationDelay: `${i * 0.08}s` }} className="aspect-video animate-fade-in overflow-hidden rounded-lg border border-border">
                    <img src={`https://images.unsplash.com/photo-${s}?auto=format&fit=crop&w=400&h=240&q=70`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}