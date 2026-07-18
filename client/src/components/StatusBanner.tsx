import { cn } from '../lib/utils';
import { CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';

interface Props {
  message: string;
  type?: 'info' | 'success' | 'error' | 'processing';
}

const CONFIG = {
  info:       { icon: Info,         bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.6)',  iconColor: 'text-white/40' },
  success:    { icon: CheckCircle2, bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',   text: '#6ee7b7',                iconColor: 'text-emerald-400' },
  error:      { icon: AlertCircle,  bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',    text: '#fca5a5',                iconColor: 'text-red-400' },
  processing: { icon: Loader2,      bg: 'rgba(132,94,247,0.08)',  border: 'rgba(132,94,247,0.2)',   text: '#c4b5fd',                iconColor: 'text-brand-400' },
};

export function StatusBanner({ message, type = 'info' }: Props) {
  const { icon: Icon, bg, border, text, iconColor } = CONFIG[type];
  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm animate-fade-in" style={{ background: bg, border: `1px solid ${border}`, color: text }}>
      <Icon size={15} className={cn(iconColor, 'mt-0.5 shrink-0', type === 'processing' && 'animate-spin')} />
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}
