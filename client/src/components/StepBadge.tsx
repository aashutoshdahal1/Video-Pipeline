import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

const STEPS = [
  { key: 'tts', label: 'Voice' },
  { key: 'transcribing', label: 'Transcript' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'images', label: 'Images' },
  { key: 'done', label: 'Done' },
];

const ORDER = STEPS.map(s => s.key);

export function StepBadge({ current }: { current: string }) {
  const idx = ORDER.indexOf(current);
  return (
    <div className="flex items-center gap-1 lg:hidden">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <span className={cn(
            'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-display',
            i < idx  && 'bg-brand-600/40 text-brand-300',
            i === idx && 'text-white',
            i > idx  && 'bg-white/5 text-white/20'
          )}
          style={i === idx ? { background: 'linear-gradient(135deg,#845ef7,#5f3dc4)', boxShadow: '0 0 8px rgba(132,94,247,0.5)' } : {}}>
            {i < idx ? <Check size={9} strokeWidth={3} /> : i + 1}
          </span>
          {i < STEPS.length - 1 && (
            <div className={cn('w-4 h-px mx-0.5', i < idx ? 'bg-brand-600/50' : 'bg-white/10')} />
          )}
        </div>
      ))}
    </div>
  );
}
