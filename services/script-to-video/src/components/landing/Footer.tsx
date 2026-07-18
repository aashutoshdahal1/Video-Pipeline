import { Logo } from "@/components/brand/Logo";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background py-12">
      <div className="container grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            AI that turns scripts into stock videos. Built for creators who ship fast.
          </p>
        </div>
        {[
          { title: "Product", links: ["Features", "Pricing", "Changelog", "Roadmap"] },
          { title: "Company", links: ["About", "Blog", "Careers", "Contact"] },
        ].map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold">{col.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {col.links.map((l) => (
                <li key={l}><a href="#" className="transition-colors hover:text-foreground">{l}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground md:flex-row">
        <p>© {new Date().getFullYear()} Script2Video AI. All rights reserved.</p>
        <p>Powered by Pexels & Pixabay</p>
      </div>
    </footer>
  );
}