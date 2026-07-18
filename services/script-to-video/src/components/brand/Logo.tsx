import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export function Logo({ to = "/", className = "" }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-vibrant shadow-glow">
        <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
      </span>
      <span className="text-lg tracking-tight">
        Script2Video<span className="gradient-text"> AI</span>
      </span>
    </Link>
  );
}