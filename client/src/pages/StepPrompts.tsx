import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi, type ImagePrompt } from '../lib/api';
import { Shell } from '../components/Shell';
import { StepBadge } from '../components/StepBadge';
import { ArrowRight, Plus, Trash2, Wand2, List, AlignLeft, Image } from 'lucide-react';
import { cn } from '../lib/utils';

const ASPECT_OPTIONS = ['16:9', '9:16', '1:1'];

type DraftPrompt = Omit<ImagePrompt, '_id' | 'status' | 'urls' | 'error'>;
type InputMode = 'rows' | 'bulk';

function emptyPrompt(): DraftPrompt {
  return { prompt: '', aspect: '16:9', count: 1 };
}

function parseBulk(text: string, aspect: string, count: number): DraftPrompt[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(prompt => ({ prompt, aspect, count }));
}

export default function StepPrompts() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [inputMode, setInputMode] = useState<InputMode>('rows');
  const [prompts, setPrompts] = useState<DraftPrompt[]>([emptyPrompt()]);
  const [bulkText, setBulkText] = useState('');
  const [bulkAspect, setBulkAspect] = useState('16:9');
  const [bulkCount, setBulkCount] = useState(1);
  const [err, setErr] = useState('');

  const { data: job, isLoading } = useQuery({ queryKey: ['job', id], queryFn: () => jobsApi.get(id!), enabled: !!id });

  const saveMut = useMutation({
    mutationFn: (toSave: DraftPrompt[]) => jobsApi.savePrompts(id!, toSave),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job', id] }); navigate(`/job/${id}/images`); },
    onError: (e: any) => setErr(e.response?.data?.error || e.message)
  });

  function loadSaved() {
    const saved = job?.imagePrompts;
    if (saved?.length) { setPrompts(saved.map(p => ({ prompt: p.prompt, aspect: p.aspect, count: p.count }))); setInputMode('rows'); }
  }

  function addRow() { setPrompts(p => [...p, emptyPrompt()]); }
  function removeRow(i: number) { setPrompts(p => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, field: keyof DraftPrompt, val: any) {
    setPrompts(p => p.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const toSave = inputMode === 'bulk' ? parseBulk(bulkText, bulkAspect, bulkCount) : prompts.filter(p => p.prompt.trim());
    if (!toSave.length) { setErr('Add at least one prompt'); return; }
    saveMut.mutate(toSave);
  }

  if (isLoading || !job) return (
    <Shell><div className="flex items-center justify-center h-64"><span className="w-6 h-6 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" /></div></Shell>
  );

  const hasSaved = !!job.imagePrompts?.length;
  const bulkLineCount = bulkText.split('\n').filter(l => l.trim()).length;

  return (
    <Shell jobTitle={job.title} currentStage={job.stage} jobId={id} maxWidth="max-w-3xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-white text-xl">{job.title}</h1>
          <p className="text-white/35 text-xs mt-0.5">Step 3 — Image Prompts</p>
        </div>
        <StepBadge current={job.stage} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Transcript reference */}
        {job.transcript && (
          <div className="step-card">
            <p className="label mb-2">Transcript (for reference)</p>
            <div className="rounded-xl p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-24 overflow-y-auto"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
              {job.transcript.replace(/(\d{2}:\d{2})\.\d{3}/g, '$1')}
            </div>
          </div>
        )}

        {/* Mode + load saved */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {(['rows', 'bulk'] as InputMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setInputMode(mode)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium font-display transition-all duration-150"
                style={inputMode === mode
                  ? { background: 'rgba(132,94,247,0.2)', border: '1px solid rgba(132,94,247,0.3)', color: '#c4b5fd' }
                  : { color: 'rgba(255,255,255,0.35)' }
                }
              >
                {mode === 'rows' ? <List size={13} /> : <AlignLeft size={13} />}
                {mode === 'rows' ? 'Row editor' : 'Bulk paste'}
              </button>
            ))}
          </div>
          {hasSaved && (
            <button type="button" onClick={loadSaved} className="btn-ghost flex items-center gap-1.5 text-xs">
              <Wand2 size={12} /> Load saved
            </button>
          )}
        </div>

        {/* Row editor */}
        {inputMode === 'rows' && (
          <div className="step-card space-y-3">
            <div className="grid grid-cols-[1fr_72px_52px_28px] gap-2 px-1">
              <span className="label">Prompt</span>
              <span className="label text-center">Aspect</span>
              <span className="label text-center">Count</span>
              <span />
            </div>

            {prompts.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_72px_52px_28px] gap-2 items-start">
                <textarea
                  value={p.prompt}
                  onChange={e => updateRow(i, 'prompt', e.target.value)}
                  placeholder={`Image ${i + 1} description…`}
                  rows={2}
                  className="input-field resize-none font-body text-sm leading-relaxed"
                />
                <select
                  value={p.aspect}
                  onChange={e => updateRow(i, 'aspect', e.target.value)}
                  className="input-field py-2 text-xs text-center"
                >
                  {ASPECT_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <input
                  type="number" min={1} max={4} value={p.count}
                  onChange={e => updateRow(i, 'count', parseInt(e.target.value) || 1)}
                  className="input-field py-2 text-xs text-center"
                />
                <button type="button" onClick={() => removeRow(i)} className="text-white/15 hover:text-red-400 transition mt-2 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button type="button" onClick={addRow}
              className="flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition font-display pt-1">
              <Plus size={14} strokeWidth={2.5} /> Add row
            </button>
          </div>
        )}

        {/* Bulk paste */}
        {inputMode === 'bulk' && (
          <div className="step-card space-y-4">
            <div>
              <p className="label mb-2">Prompts — one per line</p>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={`A cinematic view of a neuron firing\nClose-up of goosebumps rising on skin\nAncient cave painting of a woolly mammoth\n…`}
                rows={10}
                className="input-field resize-none font-mono text-sm leading-relaxed"
              />
              <p className="text-white/20 text-xs mt-1.5">{bulkLineCount} prompt{bulkLineCount !== 1 ? 's' : ''}</p>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <div className="space-y-1.5">
                <p className="label">Aspect for all</p>
                <div className="flex gap-1.5">
                  {ASPECT_OPTIONS.map(a => (
                    <button key={a} type="button" onClick={() => setBulkAspect(a)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-150"
                      style={bulkAspect === a
                        ? { background: 'rgba(132,94,247,0.18)', border: '1px solid rgba(132,94,247,0.4)', color: '#c4b5fd' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }
                      }
                    >{a}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="label">Count per prompt</p>
                <div className="flex gap-1.5">
                  {[1,2,3,4].map(n => (
                    <button key={n} type="button" onClick={() => setBulkCount(n)}
                      className="w-9 h-9 rounded-lg text-xs font-mono font-bold transition-all duration-150"
                      style={bulkCount === n
                        ? { background: 'rgba(132,94,247,0.18)', border: '1px solid rgba(132,94,247,0.4)', color: '#c4b5fd' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }
                      }
                    >{n}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {err && (
          <p className="text-sm text-red-400 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">{err}</p>
        )}

        <button
          type="submit"
          disabled={saveMut.isPending}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          {saveMut.isPending
            ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Saving…</>
            : <><Image size={14} />Save & Go to Image Generation <ArrowRight size={14} /></>
          }
        </button>
      </form>
    </Shell>
  );
}
