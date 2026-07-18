import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="container py-24">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-vibrant p-12 text-center shadow-glow md:p-20">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-5xl">Start creating in seconds</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">Join thousands of creators turning words into videos with Script2Video AI.</p>
          <Button asChild size="lg" className="mt-8 h-12 bg-white px-8 text-base font-semibold text-primary hover:bg-white/90">
            <Link to="/app">
              Get started — it's free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}