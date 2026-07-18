import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../lib/api';
import { useJobSocket } from '../hooks/useJobSocket';
import { Shell } from '../components/Shell';
import { StepBadge } from '../components/StepBadge';
import { StatusBanner } from '../components/StatusBanner';
import { ArrowRight, FileText, Copy, Check, Captions } from 'lucide-react';

const MODELS = ['tiny', 'base', 'small', 'medium', 'large'];

function stripMs(text: string): string {
  return text.replace(/(\d{2}:\d{2})\.\d{3}/g, '$1');
}

export default function StepTranscript() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [model, setModel] = useState('base');
  const [hideMs, setHideMs] = useState(true);
  const [liveMsg, setLiveMsg] = useState('');
  const [liveStatus, setLiveStatus] = useState<'info' | 'processing' | 'success' | 'error'>('info');
  const [copied, setCopied] = useState(false);

  const { data: job, isLoading } = useQuery({ queryKey: ['job', id], queryFn: () => jobsApi.get(id!), enabled: !!id });

  useJobSocket(id, (update) => {
    setLiveMsg(update.message);
    if (update.status === 'processing') setLiveStatus('processing');
    else if (update.status === 'error') setLiveStatus('error');
    else if (update.stage === 'prompts') { setLiveStatus('success'); qc.invalidateQueries({ queryKey: ['job', id] }); }
  });

  const transcribeMut = useMutation({
    mutationFn: () => jobsApi.runTranscribe(id!, model),
    onSuccess: () => { setLiveMsg('Transcription started — streaming from Whisper…'); setLiveStatus('processing'); },
    onError: (e: any) => { setLiveMsg(e.response?.data?.error || e.message); setLiveStatus('error'); }
  });

  if (isLoading || !job) return (
    <Shell><div className="flex items-center justify-center h-64"><span className="w-6 h-6 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" /></div></Shell>
  );

  const transcriptReady = !!job.transcript;
  const displayedTranscript = transcriptReady ? (hideMs ? stripMs(job.transcript!) : job.transcript!) : '';

  function handleCopy() {
    navigator.clipboard.writeText(displayedTranscript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Shell jobTitle={job.title} currentStage={job.stage} jobId={id}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-white text-xl">{job.title}</h1>
          <p className="text-white/35 text-xs mt-0.5">Step 2 — Transcription</p>
        </div>
        <StepBadge current={job.stage} />
      </div>

      <div className="space-y-4">
        {/* Audio */}
        {job.audioUrl && (
          <div className="step-card space-y-3">
            <p className="label flex items-center gap-2"><FileText size={13} /> Audio to transcribe</p>
            <audio controls className="w-full rounded-xl" src={job.audioUrl} style={{ height: '44px' }} />
          </div>
        )}

        {/* Config */}
        <div className="step-card space-y-4">
          <p className="section-title flex items-center gap-2"><Captions size={15} className="text-brand-400" /> Transcription Settings</p>

          <div className="flex flex-wrap items-center gap-5">
            <div className="space-y-1.5">
              <p className="label">Whisper model</p>
              <div className="flex gap-1.5 flex-wrap">
                {MODELS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-all duration-150"
                    style={model === m
                      ? { background: 'rgba(132,94,247,0.18)', border: '1px solid rgba(132,94,247,0.4)', color: '#c4b5fd' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="text-white/20 text-xs">larger = slower but more accurate</p>
            </div>

            {transcriptReady && (
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-xs text-white/35">Hide milliseconds</span>
                <button
                  type="button"
                  onClick={() => setHideMs(v => !v)}
                  className="relative w-9 h-5 rounded-full transition-all duration-200 focus:outline-none"
                  style={{ background: hideMs ? 'rgba(132,94,247,0.6)' : 'rgba(255,255,255,0.1)' }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
                    style={{ left: hideMs ? '18px' : '2px' }}
                  />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        {liveMsg && <StatusBanner message={liveMsg} type={liveStatus} />}

        {/* Transcript display */}
        {transcriptReady && (
          <div className="step-card space-y-3">
            <div className="flex items-center justify-between">
              <p className="section-title">Transcript</p>
              <button
                onClick={handleCopy}
                className="btn-ghost flex items-center gap-1.5 text-xs"
              >
                {copied ? <><Check size={12} className="text-emerald-400" />Copied</> : <><Copy size={12} />Copy</>}
              </button>
            </div>
            <div
              className="rounded-xl p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}
            >
              {displayedTranscript}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => { setLiveMsg('Starting transcription…'); setLiveStatus('processing'); transcribeMut.mutate(); }}
            disabled={transcribeMut.isPending || job.status === 'processing'}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {transcribeMut.isPending || job.status === 'processing'
              ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Transcribing…</>
              : <><Captions size={14} />{transcriptReady ? 'Re-Transcribe' : 'Start Transcription'}</>
            }
          </button>
          {transcriptReady && (
            <button onClick={() => navigate(`/job/${id}/prompts`)} className="btn-secondary flex items-center gap-2">
              Next <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
