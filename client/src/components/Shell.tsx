import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Check, Clapperboard } from 'lucide-react';

const STEPS = [
  { key: 'tts',          label: 'Voice',      num: 1 },
  { key: 'transcribing', label: 'Transcript',  num: 2 },
  { key: 'prompts',      label: 'Prompts',     num: 3 },
  { key: 'images',       label: 'Images',      num: 4 },
  { key: 'done',         label: 'Done',        num: 5 },
];

const ORDER = STEPS.map(s => s.key);

interface ShellProps {
  jobTitle?: string;
  currentStage?: string;
  jobId?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

const STAGE_ROUTES: Record<string, string> = {
  tts: 'voice', transcribing: 'transcript', prompts: 'prompts',
  images: 'images', done: 'images',
};

export function Shell({ jobTitle, currentStage, jobId, children, maxWidth = 'max-w-2xl' }: ShellProps) {
  const navigate = useNavigate();
  const currentIdx = currentStage ? ORDER.indexOf(currentStage) : -1;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06]" style={{ background: 'rgba(5,5,15,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#845ef7,#5f3dc4)', boxShadow: '0 0 12px rgba(132,94,247,0.4)' }}>
              <Clapperboard size={14} className="text-white" />
            </div>
            <span className="font-display font-semibold text-sm text-white/80 group-hover:text-white transition">Video Pipeline</span>
          </button>

          {jobTitle && (
            <span className="text-xs text-white/35 font-medium truncate max-w-xs">{jobTitle}</span>
          )}
        </div>
      </header>

      <div className="flex flex-1 max-w-6xl mx-auto w-full px-6 py-8 gap-8">
        {/* Sidebar stepper — only shown on job pages */}
        {currentStage && jobId && (
          <aside className="hidden lg:flex flex-col gap-1 w-44 shrink-0 pt-1">
            {STEPS.map((step, i) => {
              const done = i < currentIdx;
              const active = i === currentIdx;
              const locked = i > currentIdx;
              const route = STAGE_ROUTES[step.key];

              return (
                <button
                  key={step.key}
                  onClick={() => !locked && route && navigate(`/job/${jobId}/${route}`)}
                  disabled={locked}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200',
                    active && 'text-white',
                    done && 'text-white/60 hover:text-white/80 hover:bg-white/[0.04]',
                    locked && 'text-white/20 cursor-not-allowed'
                  )}
                  style={active ? { background: 'rgba(132,94,247,0.12)', border: '1px solid rgba(132,94,247,0.25)' } : {}}
                >
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all',
                    active && 'text-white shadow-glow-sm',
                    done && 'bg-brand-600/40 text-brand-300',
                    locked && 'bg-white/5 text-white/20'
                  )}
                  style={active ? { background: 'linear-gradient(135deg,#845ef7,#5f3dc4)', boxShadow: '0 0 10px rgba(132,94,247,0.5)' } : {}}>
                    {done ? <Check size={11} strokeWidth={3} /> : step.num}
                  </div>
                  <span className={cn('text-sm font-medium font-display', active && 'text-white', !active && !locked && 'text-white/55')}>{step.label}</span>
                  {active && <div className="ml-auto w-1 h-4 rounded-full bg-brand-400" />}
                </button>
              );
            })}
          </aside>
        )}

        {/* Main content */}
        <main className={cn('flex-1 min-w-0', !currentStage && `${maxWidth} mx-auto w-full`)}>
          {children}
        </main>
      </div>
    </div>
  );
}
