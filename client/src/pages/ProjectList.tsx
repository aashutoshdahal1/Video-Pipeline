import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { jobsApi, type Job } from '../lib/api';
import { Shell } from '../components/Shell';
import { Trash2, Plus, Clapperboard, Mic, FileText, Image, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

const STAGE_META: Record<string, { label: string; icon: typeof Mic; color: string }> = {
  tts:          { label: 'Voice generation',  icon: Mic,       color: 'text-violet-400'  },
  transcribing: { label: 'Transcription',     icon: FileText,  color: 'text-cyan-400'    },
  prompts:      { label: 'Image prompts',     icon: FileText,  color: 'text-amber-400'   },
  images:       { label: 'Image generation',  icon: Image,     color: 'text-emerald-400' },
  done:         { label: 'Complete',          icon: Image,     color: 'text-green-400'   },
};

const STAGE_ORDER = ['tts','transcribing','prompts','images','done'];

function ProgressBar({ stage }: { stage: string }) {
  const idx = STAGE_ORDER.indexOf(stage);
  const pct = Math.round(((idx) / (STAGE_ORDER.length - 1)) * 100);
  return (
    <div className="mt-3 h-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#845ef7,#22d3ee)' }} />
    </div>
  );
}

export default function ProjectList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useQuery({ queryKey: ['jobs'], queryFn: jobsApi.list });

  const deleteMut = useMutation({
    mutationFn: jobsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] })
  });

  function handleOpen(job: Job) {
    const routes: Record<string, string> = { tts: 'voice', transcribing: 'transcript', prompts: 'prompts', images: 'images' };
    const route = routes[job.stage] || 'images';
    navigate(`/job/${job._id}/${route}`);
  }

  return (
    <Shell maxWidth="max-w-3xl">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg,#845ef7,#5f3dc4)', boxShadow: '0 0 32px rgba(132,94,247,0.4)' }}>
          <Clapperboard size={24} className="text-white" />
        </div>
        <h1 className="font-display text-3xl font-bold gradient-text mb-2">Video Pipeline</h1>
        <p className="text-white/40 text-sm">Voice → Transcript → Images → Timeline</p>
      </div>

      {/* CTA */}
      <div className="flex justify-center mb-8">
        <button onClick={() => navigate('/new')} className="btn-primary flex items-center gap-2">
          <Plus size={15} strokeWidth={2.5} /> New Project
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
      )}

      {!isLoading && jobs.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Clapperboard size={28} className="text-white/15" />
          </div>
          <p className="text-white/30 text-sm">No projects yet — create one above</p>
        </div>
      )}

      <div className="space-y-3">
        {jobs.map(job => {
          const meta = STAGE_META[job.stage] || STAGE_META.tts;
          const Icon = meta.icon;
          return (
            <div
              key={job._id}
              className="group relative rounded-2xl p-5 cursor-pointer transition-all duration-200 animate-fade-up"
              style={{ background: 'rgba(14,14,34,0.7)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(16px)' }}
              onClick={() => handleOpen(job)}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(132,94,247,0.35)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 20px rgba(132,94,247,0.1)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
              }}
            >
              <div className="flex items-start gap-4">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5')}
                  style={{ background: 'rgba(132,94,247,0.12)', border: '1px solid rgba(132,94,247,0.2)' }}>
                  <Icon size={15} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display font-semibold text-white truncate">{job.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-white/25">{new Date(job.updatedAt).toLocaleDateString()}</span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteMut.mutate(job._id); }}
                        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all p-1 rounded"
                      >
                        <Trash2 size={13} />
                      </button>
                      <ChevronRight size={14} className="text-white/20 group-hover:text-brand-400 transition-colors" />
                    </div>
                  </div>
                  <p className={cn('text-xs mt-0.5', meta.color)}>{meta.label}</p>
                  {job.status === 'error' && <p className="text-xs text-red-400 mt-0.5">Error — click to retry</p>}
                  <ProgressBar stage={job.stage} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
