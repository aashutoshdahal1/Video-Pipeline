import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ClipCard, ClipSkeleton } from "@/components/app/ClipCard";
import { MOCK_CLIPS } from "@/lib/data/clips";
import api from '@/lib/api';

const TAGS = ["all", "nature", "city", "people", "work", "ocean", "mountains", "night"];

export default function Library() {
  const [tag, setTag] = useState("all");
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api.listSaved();
        if (res && res.success) setSaved(res.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return saved.filter((c) => {
      const matchTag = tag === "all" || c.tags.includes(tag);
      const matchQ = !q || c.title.toLowerCase().includes(q.toLowerCase()) || c.tags.some((t) => t.includes(q.toLowerCase()));
      return matchTag && matchQ;
    });
  }, [tag, q, saved]);

  const removeSaved = async (id: string) => {
    const result = await api.deleteSaved(id);
    if (!result || !result.success) {
      throw new Error(result?.message || 'Failed to delete saved video');
    }
    setSaved((current) => current.filter((item) => item._id !== id));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Saved Library</h1>
        <p className="mt-1 text-muted-foreground">Your collection of saved clips, ready to reuse.</p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clips by title or tag…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                tag === t
                  ? "border-primary bg-primary text-primary-foreground shadow-glow"
                  : "border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <ClipSkeleton key={i} />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => <ClipCard key={c._id} clip={{
            id: c._id,
            title: c.title || '',
            thumbnail: c.thumbnail || '',
            duration: c.duration || '',
            source: c.source || 'Unknown',
            tags: c.tags || [],
            videoUrl: c.videoUrl || ''
          }} onRemove={() => removeSaved(c._id)} removeLabel="Delete saved clip" />)}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-16 text-center">
          <h3 className="text-lg font-semibold">No clips found</h3>
          <p className="mt-1 text-sm text-muted-foreground">Try a different search or tag filter.</p>
        </div>
      )}
    </div>
  );
}