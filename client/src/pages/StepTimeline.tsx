import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { jobsApi } from '../lib/api';
import { Shell } from '../components/Shell';
import { StepBadge } from '../components/StepBadge';
import { ExternalLink, Download, CheckCircle2, XCircle, Film, Mic, FileText, Image } from 'lucide-react';

const SCRIPT_TO_VIDEO_URL = import.meta.env.VITE_S2V_URL || 'http://localhost:5173';

export default function StepTimeline() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: job, isLoading } = useQuery({ queryKey: ['job', id], queryFn: () => jobsApi.get(id!), enabled: !!id });

  if (isLoading || !job) return (
    <Shell><div className="flex items-center justify-center h-64"><span className="w-6 h-6 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" /></div></Shell>
  );

  const imageUrls = job.imagePrompts.flatMap(p => p.urls || []);
  const audioUrl = job.audioUrl ? `${window.location.origin}${job.audioUrl}` : null;

  const s2vParams = new URLSearchParams();
  if (audioUrl) s2vParams.set('audio', audioUrl);
  if (job.transcript) s2vParams.set('transcript', encodeURIComponent(job.transcript));
  imageUrls.slice(0, 20).forEach((u, i) => s2vParams.set(`img${i}`, u));
  const s2vUrl = `${SCRIPT_TO_VIDEO_URL}?${s2vParams.toString()}`;

  const stats = [
    { icon: Mic,      label: 'Audio',       value: audioUrl ? '✓' : null,          ok: !!audioUrl },
    { icon: FileText, label: 'Transcript',  value: job.transcript ? '✓' : null,    ok: !!job.transcript },
    { icon: Image,    label: 'Images',      value: String(imageUrls.length),        ok: imageUrls.length > 0 },
  ];

  return (
    <Shell jobTitle={job.title} currentStage={job.stage} jobId={id}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-white text-xl">{job.title}</h1>
          <p className="text-white/35 text-xs mt-0.5">Step 5 — Timeline Editor</p>
        </div>
        <StepBadge current={job.stage} />
      </div>

      <div className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map(({ icon: Icon, label, value, ok }) => (
            <div key={label} className="step-card text-center space-y-2">
              <div className="flex justify-center">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={ok ? { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' } : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <Icon size={15} className={ok ? 'text-emerald-400' : 'text-red-500/50'} />
                </div>
              </div>
              <p className="font-display font-bold text-white text-lg leading-none">
                {ok ? (
                  <span className="gradient-text">{value}</span>
                ) : (
                  <XCircle size={18} className="mx-auto text-red-500/40" />
                )}
              </p>
              <p className="text-white/30 text-xs">{label}</p>
            </div>
          ))}
        </div>

        {/* Launch CTA */}
        <div className="step-card space-y-3">
          <p className="section-title flex items-center gap-2"><Film size={15} className="text-brand-400" /> Open in Timeline Editor</p>
          <p className="text-white/35 text-xs leading-relaxed">
            Opens script-to-video with your audio, transcript and images pre-loaded.
          </p>
          <a
            href={s2vUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center justify-center gap-2 w-full py-3 text-base"
          >
            <ExternalLink size={16} /> Launch Timeline Editor
          </a>
        </div>

        {/* Audio player */}
        {audioUrl && (
          <div className="step-card space-y-2">
            <p className="label flex items-center gap-2"><Mic size={13} /> Audio track</p>
            <audio controls className="w-full rounded-xl" src={audioUrl} style={{ height: '44px' }} />
          </div>
        )}

        {/* Transcript */}
        {job.transcript && (
          <div className="step-card space-y-2">
            <p className="label flex items-center gap-2"><FileText size={13} /> Transcript</p>
            <div className="rounded-xl p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>
              {job.transcript}
            </div>
          </div>
        )}

        {/* Image gallery */}
        {imageUrls.length > 0 && (
          <div className="step-card space-y-3">
            <p className="label flex items-center gap-2"><Image size={13} /> Generated images ({imageUrls.length})</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {imageUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group relative block rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  <img
                    src={url}
                    alt={`Image ${i + 1}`}
                    className="w-full aspect-video object-cover transition-transform duration-200 group-hover:scale-105"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
                    style={{ background: 'rgba(132,94,247,0.2)' }}>
                    <ExternalLink size={14} className="text-white" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Downloads */}
        <div className="step-card space-y-3">
          <p className="section-title flex items-center gap-2"><Download size={14} className="text-brand-400" /> Download Assets</p>
          <div className="flex flex-wrap gap-2">
            {audioUrl && (
              <a href={audioUrl} download className="btn-secondary flex items-center gap-1.5 text-xs py-2">
                <Mic size={12} /> Audio (.wav)
              </a>
            )}
            {job.transcript && (
              <button
                onClick={() => {
                  const blob = new Blob([job.transcript!], { type: 'text/plain' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `${job.title}-transcript.txt`;
                  a.click();
                }}
                className="btn-secondary flex items-center gap-1.5 text-xs py-2"
              >
                <FileText size={12} /> Transcript (.txt)
              </button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
