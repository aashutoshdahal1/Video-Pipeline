import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi, voicesApi } from '../lib/api';
import { useJobSocket } from '../hooks/useJobSocket';
import { Shell } from '../components/Shell';
import { StepBadge } from '../components/StepBadge';
import { StatusBanner } from '../components/StatusBanner';
import { ArrowRight, Upload, Mic, AudioWaveform, PlayCircle } from 'lucide-react';
import { cn } from '../lib/utils';

type VoiceMode = 'preset' | 'clone';

export default function StepVoice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [liveMsg, setLiveMsg] = useState('');
  const [liveStatus, setLiveStatus] = useState<'info' | 'processing' | 'success' | 'error'>('info');
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('preset');
  const [selectedVoice, setSelectedVoice] = useState('alba');
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: job, isLoading } = useQuery({ queryKey: ['job', id], queryFn: () => jobsApi.get(id!), enabled: !!id });
  const { data: voices = ['alba', 'expresso', 'moshi'] } = useQuery({ queryKey: ['voices'], queryFn: voicesApi.list });

  useJobSocket(id, (update) => {
    setLiveMsg(update.message);
    if (update.status === 'processing') setLiveStatus('processing');
    else if (update.status === 'error') setLiveStatus('error');
    else if (update.stage === 'transcribing') { setLiveStatus('success'); qc.invalidateQueries({ queryKey: ['job', id] }); }
  });

  const ttsMut = useMutation({
    mutationFn: () => jobsApi.runTTS(
      id!,
      voiceMode === 'clone' ? cloneFile ?? undefined : undefined,
      voiceMode === 'preset' ? selectedVoice : undefined,
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job', id] }); setLiveMsg('Audio generated! Proceed to transcription.'); setLiveStatus('success'); },
    onError: (e: any) => { setLiveMsg(e.response?.data?.error || e.message); setLiveStatus('error'); }
  });

  if (isLoading || !job) return (
    <Shell><div className="flex items-center justify-center h-64"><span className="w-6 h-6 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" /></div></Shell>
  );

  const audioReady = !!job.audioUrl;
  const canGenerate = voiceMode === 'preset' || !!cloneFile;

  return (
    <Shell jobTitle={job.title} currentStage={job.stage} jobId={id}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-white text-xl">{job.title}</h1>
          <p className="text-white/35 text-xs mt-0.5">Step 1 — Voice Generation</p>
        </div>
        <StepBadge current={job.stage} />
      </div>

      <div className="space-y-4">
        {/* Script preview */}
        <div className="step-card">
          <p className="label">Your script</p>
          <div className="rounded-xl p-4 text-sm leading-relaxed" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)', maxHeight: '140px', overflowY: 'auto' }}>
            {job.voicePrompt}
          </div>
        </div>

        {/* Voice config */}
        <div className="step-card space-y-4">
          <p className="section-title flex items-center gap-2"><Mic size={16} className="text-brand-400" /> Voice Settings</p>

          {/* Mode tabs */}
          <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {(['preset', 'clone'] as VoiceMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setVoiceMode(mode)}
                className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium font-display transition-all duration-200')}
                style={voiceMode === mode
                  ? { background: 'rgba(132,94,247,0.2)', border: '1px solid rgba(132,94,247,0.35)', color: '#c4b5fd', boxShadow: '0 0 12px rgba(132,94,247,0.15)' }
                  : { color: 'rgba(255,255,255,0.35)' }
                }
              >
                {mode === 'preset' ? <Mic size={13} /> : <Upload size={13} />}
                {mode === 'preset' ? 'Preset voice' : 'Clone a voice'}
              </button>
            ))}
          </div>

          {voiceMode === 'preset' && (
            <div className="flex gap-2 flex-wrap">
              {voices.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSelectedVoice(v)}
                  className="px-3 py-2 rounded-xl text-sm font-medium font-display transition-all duration-150"
                  style={selectedVoice === v
                    ? { background: 'rgba(132,94,247,0.18)', border: '1px solid rgba(132,94,247,0.4)', color: '#c4b5fd' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {voiceMode === 'clone' && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl p-5 text-center cursor-pointer transition-all duration-200"
              style={cloneFile
                ? { background: 'rgba(132,94,247,0.08)', border: '2px dashed rgba(132,94,247,0.4)' }
                : { background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.08)' }
              }
              onMouseEnter={e => !cloneFile && ((e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.15)')}
              onMouseLeave={e => !cloneFile && ((e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)')}
            >
              {cloneFile ? (
                <div className="flex items-center justify-center gap-2 text-brand-300 text-sm font-medium">
                  <AudioWaveform size={16} /> {cloneFile.name}
                </div>
              ) : (
                <>
                  <Upload size={20} className="mx-auto mb-2 text-white/20" />
                  <p className="text-sm text-white/40">Drop a voice sample or click to upload</p>
                  <p className="text-xs text-white/20 mt-1">WAV · MP3 · 3–30 seconds works best</p>
                </>
              )}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={e => setCloneFile(e.target.files?.[0] ?? null)} />
        </div>

        {/* Status */}
        {liveMsg && <StatusBanner message={liveMsg} type={liveStatus} />}

        {/* Audio player */}
        {audioReady && (
          <div className="step-card space-y-3">
            <p className="section-title flex items-center gap-2"><PlayCircle size={15} className="text-emerald-400" /> Generated Audio</p>
            <audio controls className="w-full rounded-xl" src={job.audioUrl} style={{ height: '44px' }} />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => { setLiveMsg('Generating audio…'); setLiveStatus('processing'); ttsMut.mutate(); }}
            disabled={ttsMut.isPending || job.status === 'processing' || !canGenerate}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {ttsMut.isPending || job.status === 'processing'
              ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Generating…</>
              : <><Mic size={14} />{audioReady ? 'Regenerate Audio' : 'Generate Audio'}</>
            }
          </button>
          {audioReady && (
            <button onClick={() => navigate(`/job/${id}/transcript`)} className="btn-secondary flex items-center gap-2">
              Next <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
