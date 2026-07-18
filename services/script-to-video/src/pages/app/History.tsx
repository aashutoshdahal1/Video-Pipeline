import { useState } from "react";
import { Clock, FileText } from "lucide-react";
import { Link } from "react-router-dom";

const items = [
  { id: "1", title: "City Lights — Brand Story", scenes: 3, clips: 9, when: "2 hours ago" },
  { id: "2", title: "Product launch teaser", scenes: 4, clips: 12, when: "Yesterday" },
  { id: "3", title: "Founder interview B-roll", scenes: 6, clips: 18, when: "3 days ago" },
  { id: "4", title: "Coffee shop ad", scenes: 2, clips: 6, when: "1 week ago" },
];

export default function History() {
  const [history, setHistory] = useState<Array<any>>(() => {
    try {
      const raw = localStorage.getItem('scriptHistory');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const rerun = (item: any) => {
    localStorage.setItem('selectedScript', item.script || '');
    window.location.href = '/app';
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <p className="mt-1 text-muted-foreground">Your past generations, organized by recency.</p>
      </div>
      <div className="space-y-3">
        {history.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">No history yet. Generate a script to populate this list.</div>
        )}
        {history.map((it) => (
          <div key={it.id} onClick={() => rerun(it)} className="group cursor-pointer flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-card transition-smooth hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold group-hover:text-primary">{it.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{it.scenes} scenes · {it.clips} clips</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {it.when}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}