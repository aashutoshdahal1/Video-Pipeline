import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { jobsApi, type ImagePrompt } from '../lib/api';
import { Shell } from '../components/Shell';
import { StepBadge } from '../components/StepBadge';
import { Square, Play, ImageIcon, FolderOpen, RotateCcw, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

const DOODLEGEN = '/doodlegen';

type QueueItem = ImagePrompt & { index: number; savedPaths: string[] };

function promptToFilename(prompt: string, index: number): string {
  return prompt
    .trim()
    .replace(/:/g, '-')
    .replace(/[\\/*?"<>|,]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 60)
    .replace(/^_|_$/, '') || `image_${index + 1}`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  return `~${Math.ceil(seconds / 60)}m`;
}

const STATUS_ICON = {
  done:       <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />,
  failed:     <XCircle      size={13} className="text-red-400 shrink-0" />,
  generating: <Loader2      size={13} className="text-brand-400 shrink-0 animate-spin" />,
  pending:    <Clock        size={13} className="text-white/20 shrink-0" />,
};

export default function StepImages() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [folder, setFolder] = useState('AutoLabs_pipeline');
  const [eta, setEta] = useState('');
  const [workers, setWorkers] = useState(1);
  const timingSamples = useRef<number[]>([]);
  const stopRef = useRef(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id!),
    enabled: !!id,
    refetchInterval: running ? false : 4000,
  });

  useEffect(() => {
    if (job && !running) {
      setQueue(job.imagePrompts.map((p, i) => ({ ...p, index: i, savedPaths: [] })));
    }
  }, [job?.imagePrompts.length]);

  useEffect(() => {
    if (!running) { setEta(''); return; }
    const interval = setInterval(() => {
      const pending = queue.filter(q => q.status === 'pending' || q.status === 'generating').length;
      if (!pending) { setEta(''); return; }
      const avg = timingSamples.current.length
        ? timingSamples.current.reduce((a, b) => a + b, 0) / timingSamples.current.length
        : 18;
      const batches = Math.ceil(pending / Math.max(workers, 1));
      setEta(formatEta(batches * avg));
    }, 1000);
    return () => clearInterval(interval);
  }, [running, queue, workers]);

  async function saveImageToDisk(url: string, filename: string): Promise<string | null> {
    try {
      const resp = await fetch(`${DOODLEGEN}/api/save/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, filename: `${filename}.png`, folder })
      });
      const data = await resp.json();
      return data.ok ? data.path : null;
    } catch { return null; }
  }

  async function runWorker(_workerIdx: number) {
    while (true) {
      if (stopRef.current) break;

      let claimed = -1;
      setQueue(prev => {
        const i = prev.findIndex(q => q.status === 'pending');
        if (i === -1) return prev;
        claimed = i;
        const next = [...prev];
        next[i] = { ...next[i], status: 'generating' };
        return next;
      });
      await new Promise(r => setTimeout(r, 0));
      if (claimed === -1) break;

      let prompt = '', aspect = '16:9', count = 1;
      setQueue(prev => {
        const item = prev[claimed];
        if (item) { prompt = item.prompt; aspect = item.aspect; count = item.count; }
        return prev;
      });
      await new Promise(r => setTimeout(r, 0));

      const t0 = Date.now();
      let urls: string[] = [];
      let errorMsg: string | null = null;

      try {
        const resp = await fetch(`${DOODLEGEN}/api/generate/image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, aspect, count: Math.min(count, 4), tokens: [] })
        });
        const data = await resp.json();
        if (!resp.ok || !data.urls?.length) throw new Error(data.error || 'No images returned');
        urls = data.urls;
        const elapsed = (Date.now() - t0) / 1000;
        timingSamples.current.push(elapsed / count);
        if (timingSamples.current.length > 20) timingSamples.current.shift();
      } catch (e: any) { errorMsg = e.message; }

      const savedPaths: string[] = [];
      if (urls.length) {
        await Promise.all(urls.map(async (url, j) => {
          const fname = promptToFilename(prompt, claimed) + (j > 0 ? `_${j + 1}` : '');
          const p = await saveImageToDisk(url, fname);
          if (p) savedPaths.push(p);
        }));
      }

      setQueue(prev => {
        const next = [...prev];
        next[claimed] = { ...next[claimed], status: errorMsg ? 'failed' : 'done', urls: urls.length ? urls : next[claimed].urls, error: errorMsg ?? undefined, savedPaths };
        return next;
      });

      jobsApi.reportImage(id!, claimed, { status: errorMsg ? 'failed' : 'done', urls, error: errorMsg ?? undefined }).catch(() => {});
      if (!stopRef.current) await new Promise(r => setTimeout(r, 400));
    }
  }

  async function handleRun() {
    if (!id || running) return;
    stopRef.current = false;
    setStopped(false);
    timingSamples.current = [];

    const fresh = await jobsApi.startImages(id);
    qc.setQueryData(['job', id], fresh);
    const freshQueue: QueueItem[] = fresh.imagePrompts.map((p, i) => ({ ...p, index: i, savedPaths: [] }));
    setQueue(freshQueue);
    setRunning(true);

    await Promise.all(Array.from({ length: Math.max(1, workers) }, (_, wi) => runWorker(wi)));

    setRunning(false);
    stopRef.current = false;
    qc.invalidateQueries({ queryKey: ['job', id] });
  }

  function handleStop() {
    stopRef.current = true;
    setStopped(true);
    setRunning(false);
  }

  if (isLoading || !job) return (
    <Shell><div className="flex items-center justify-center h-64"><span className="w-6 h-6 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" /></div></Shell>
  );

  const doneCount = queue.filter(q => q.status === 'done').length;
  const failedCount = queue.filter(q => q.status === 'failed').length;
  const generatingCount = queue.filter(q => q.status === 'generating').length;
  const anyGenerated = queue.some(q => q.urls && q.urls.length > 0);
  const allSettled = queue.length > 0 && queue.every(q => q.status === 'done' || q.status === 'failed');
  const stuck = job?.status === 'processing' && !running;
  const progressPct = queue.length ? Math.round((doneCount + failedCount) / queue.length * 100) : 0;

  return (
    <Shell jobTitle={job.title} currentStage={job.stage} jobId={id} maxWidth="max-w-4xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-white text-xl">{job.title}</h1>
          <p className="text-white/35 text-xs mt-0.5">Step 4 — Image Generation</p>
        </div>
        <StepBadge current={job.stage} />
      </div>

      <div className="space-y-4">
        {/* Config card */}
        <div className="step-card space-y-4">
          <p className="section-title flex items-center gap-2"><ImageIcon size={15} className="text-brand-400" /> Generation Settings</p>

          <div className="flex flex-wrap gap-5 items-end">
            <div className="flex-1 min-w-48 space-y-1.5">
              <label className="label flex items-center gap-1.5"><FolderOpen size={12} />Save folder</label>
              <input
                value={folder}
                onChange={e => setFolder(e.target.value)}
                disabled={running}
                placeholder="AutoLabs_pipeline"
                className="input-field disabled:opacity-50"
              />
              <p className="text-white/20 text-xs font-mono">~/Downloads/{folder}</p>
            </div>

            <div className="space-y-1.5">
              <p className="label">Parallel workers</p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    type="button"
                    disabled={running}
                    onClick={() => setWorkers(n)}
                    className="w-10 h-10 rounded-xl text-sm font-bold font-mono transition-all duration-150 disabled:opacity-50"
                    style={workers === n
                      ? { background: 'rgba(132,94,247,0.2)', border: '1px solid rgba(132,94,247,0.4)', color: '#c4b5fd' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }
                    }
                  >
                    {n}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {queue.length > 0 && (
          <div className="step-card space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-display font-semibold">{doneCount} done</span>
                {generatingCount > 0 && <span className="text-brand-400 font-display">{generatingCount} running</span>}
                {failedCount > 0 && <span className="text-red-400 font-display">{failedCount} failed</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/25 text-xs">{doneCount + failedCount} / {queue.length}</span>
                {eta && running && (
                  <span className="badge flex items-center gap-1"><Clock size={11} />{eta}</span>
                )}
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,#845ef7,#22d3ee)' }}
              />
            </div>
          </div>
        )}

        {/* Stuck banner */}
        {stuck && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#fde047' }}>
            <span className="flex-1">A previous run may have stalled.</span>
            <button
              onClick={async () => { await jobsApi.resetJob(id!); qc.invalidateQueries({ queryKey: ['job', id] }); }}
              className="flex items-center gap-1.5 text-xs bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-300 px-3 py-1.5 rounded-lg transition"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
        )}

        {/* Queue list */}
        <div className="space-y-2">
          {queue.map((item, i) => (
            <div
              key={item._id || i}
              className="rounded-xl p-4 transition-all duration-200"
              style={{
                background: item.status === 'done'       ? 'rgba(16,185,129,0.05)'  :
                            item.status === 'failed'     ? 'rgba(239,68,68,0.05)'   :
                            item.status === 'generating' ? 'rgba(132,94,247,0.07)'  : 'rgba(255,255,255,0.025)',
                border:     item.status === 'done'       ? '1px solid rgba(16,185,129,0.2)'  :
                            item.status === 'failed'     ? '1px solid rgba(239,68,68,0.2)'   :
                            item.status === 'generating' ? '1px solid rgba(132,94,247,0.3)'  : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{STATUS_ICON[item.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.pending}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-white leading-snug line-clamp-2 font-body">{item.prompt}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-white/25 text-xs font-mono">{item.aspect}</span>
                    </div>
                  </div>

                  {item.status === 'generating' && (
                    <p className="text-xs text-brand-300/70 mt-1 font-display">Generating…</p>
                  )}

                  {item.status === 'pending' && (
                    <p className="text-xs text-white/20 mt-1">Waiting for worker</p>
                  )}

                  {item.error && (
                    <p className="text-xs text-red-400 mt-1 bg-red-500/8 px-2 py-1 rounded-lg">{item.error}</p>
                  )}

                  {item.savedPaths?.length > 0 && (
                    <p className="text-xs text-emerald-500/80 mt-1 flex items-center gap-1 font-mono">
                      <FolderOpen size={10} /> {item.savedPaths[0]}
                    </p>
                  )}

                  {item.urls && item.urls.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                      {item.urls.map((url, j) => (
                        <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                          className="group relative block rounded-lg overflow-hidden"
                          style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                          <img
                            src={url}
                            alt={`img-${i}-${j}`}
                            className="w-full aspect-video object-cover transition-transform duration-200 group-hover:scale-105"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Action bar */}
        <div className="flex gap-3 flex-wrap pt-1">
          {!running ? (
            <button
              onClick={handleRun}
              disabled={!queue.length}
              className="btn-primary flex items-center gap-2"
            >
              <Play size={14} />
              {anyGenerated ? 'Re-run All' : 'Run Queue'}
              {workers > 1 && <span className="text-xs opacity-60 font-normal">({workers}× parallel)</span>}
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold font-display transition-all duration-200"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
            >
              <Square size={14} /> Stop
            </button>
          )}

        </div>

        {stopped && (
          <p className="text-xs text-yellow-400/70 font-display">
            Stopped — {doneCount} done, {failedCount} failed. Click Run Queue to resume.
          </p>
        )}
      </div>
    </Shell>
  );
}
