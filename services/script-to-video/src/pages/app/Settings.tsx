import { useState } from "react";
import { Eye, EyeOff, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";

export default function Settings() {
  const { theme, toggle } = useTheme();
  const [showPexels, setShowPexels] = useState(false);
  const [showPixabay, setShowPixabay] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your API keys, theme, and usage limits.</p>
      </div>

      <Section title="API Keys" desc="Connect your own Pexels and Pixabay accounts for higher limits.">
        <ApiKeyForm />
      </Section>

      <Section title="Appearance" desc="Choose how Script2Video looks to you.">
        <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-4">
          <div>
            <p className="font-medium">Dark mode</p>
            <p className="text-xs text-muted-foreground">Currently {theme}</p>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggle} />
        </div>
      </Section>

      <Section title="Usage" desc="Free plan resets monthly. Upgrade for unlimited generations.">
        <div className="rounded-xl border border-border bg-secondary/40 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Generations</span>
            <span className="text-muted-foreground">42 / 100</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full w-[42%] rounded-full bg-gradient-primary" />
          </div>
          <div className="mt-5 flex items-center justify-between text-sm">
            <span className="font-medium">Saved clips</span>
            <span className="text-muted-foreground">284 / 500</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full w-[57%] rounded-full bg-gradient-vibrant" />
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function KeyField({ label, show, setShow }: { label: string; show: boolean; setShow: (b: boolean) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={label} type={show ? "text" : "password"} placeholder="sk_•••••••••••••••" className="px-9" defaultValue="" />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Toggle visibility"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ApiKeyForm() {
  const [showPexels, setShowPexels] = useState(false);
  const [showPixabay, setShowPixabay] = useState(false);
  const [pexels, setPexels] = useState(() => localStorage.getItem('pexels_key') || '');
  const [pixabay, setPixabay] = useState(() => localStorage.getItem('pixabay_key') || '');

  const save = () => {
    localStorage.setItem('pexels_key', pexels);
    localStorage.setItem('pixabay_key', pixabay);
    toast.success('API keys saved');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Pexels API key</Label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={pexels} onChange={(e) => setPexels(e.target.value)} type={showPexels ? 'text' : 'password'} className="px-9" />
          <button type="button" onClick={() => setShowPexels(!showPexels)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPexels ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Pixabay API key</Label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={pixabay} onChange={(e) => setPixabay(e.target.value)} type={showPixabay ? 'text' : 'password'} className="px-9" />
          <button type="button" onClick={() => setShowPixabay(!showPixabay)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPixabay ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button onClick={save} className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95">Save keys</Button>
    </div>
  );
}