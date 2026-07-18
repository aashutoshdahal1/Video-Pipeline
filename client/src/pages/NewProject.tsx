import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { jobsApi, voicesApi } from '../lib/api';
import { Shell } from '../components/Shell';
import { ArrowLeft, ArrowRight, Mic, Type } from 'lucide-react';

export default function NewProject() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [voicePrompt, setVoicePrompt] = useState('');
  const [voiceName, setVoiceName] = useState('alba');
  const [err, setErr] = useState('');

  const { data: voices = [] } = useQuery({ queryKey: ['voices'], queryFn: voicesApi.list });

  const createMut = useMutation({
    mutationFn: jobsApi.create,
    onSuccess: (job) => navigate(`/job/${job._id}/voice`),
    onError: (e: any) => setErr(e.response?.data?.error || e.message)
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!voicePrompt.trim()) { setErr('Script is required'); return; }
    setErr('');
    createMut.mutate({ title: title || 'Untitled Project', voicePrompt: voicePrompt.trim(), voiceName });
  }

  const charCount = voicePrompt.length;
  const wordCount = voicePrompt.trim() ? voicePrompt.trim().split(/\s+/).length : 0;

  return (
    <Shell maxWidth="max-w-xl">
      <button onClick={() => navigate('/')} className="btn-ghost flex items-center gap-1.5 mb-6">
        <ArrowLeft size={14} /> Back to projects
      </button>

      <div className="flex items-center gap-3 mb-7">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#845ef7,#5f3dc4)', boxShadow: '0 0 16px rgba(132,94,247,0.35)' }}>
          <Type size={17} className="text-white" />
        </div>
        <div>
          <h1 className="font-display font-bold text-white text-xl">New Project</h1>
          <p className="text-white/35 text-xs">Write your script, pick a voice, done</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="label">Project title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Why We Get Goosebumps"
            className="input-field"
          />
        </div>

        <div>
          <label className="label">Script / voice prompt <span className="text-red-400 normal-case tracking-normal">*</span></label>
          <div className="relative">
            <textarea
              value={voicePrompt}
              onChange={e => setVoicePrompt(e.target.value)}
              placeholder="Type or paste the full text you want converted to speech…"
              rows={8}
              className="input-field resize-none font-body leading-relaxed"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-3 text-xs pointer-events-none" style={{ color: 'rgba(255,255,255,0.2)' }}>
              <span>{wordCount} words</span>
              <span>{charCount} chars</span>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Voice</label>
          <div className="flex gap-2 flex-wrap">
            {(voices.length > 0 ? voices : ['alba', 'expresso', 'moshi']).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setVoiceName(v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium font-display transition-all duration-150"
                style={voiceName === v
                  ? { background: 'rgba(132,94,247,0.18)', border: '1px solid rgba(132,94,247,0.4)', color: '#c4b5fd', boxShadow: '0 0 12px rgba(132,94,247,0.2)' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }
                }
              >
                <Mic size={12} />
                {v}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <p className="text-sm text-red-400 flex items-center gap-1.5 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
            {err}
          </p>
        )}

        <button
          type="submit"
          disabled={createMut.isPending}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
        >
          {createMut.isPending
            ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Creating…</>
            : <>Create & Generate Voice <ArrowRight size={16} /></>
          }
        </button>
      </form>
    </Shell>
  );
}
