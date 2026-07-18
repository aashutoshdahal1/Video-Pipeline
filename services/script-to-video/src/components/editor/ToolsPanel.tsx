import { memo, useRef } from "react";
import { Mic, Music2, Scissors, Sliders, Trash2, Upload, Video, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor, usePlayback, formatTime } from "./editor-context";

export default memo(function ToolsPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const musicInputRef = useRef<HTMLInputElement | null>(null);
  const {
    clips,
    splitClip,
    removeClip,
    updateTrim,
    toggleClipMute,
    voiceVolume,
    setVoiceVolume,
    voiceMuted,
    setVoiceMuted,
    musicVolume,
    setMusicVolume,
    musicFile,
    setMusicFile,
    voiceFiles,
    addVoiceFile,
    recording,
    startRecording,
    stopRecording,
  } = useEditor();
  const { selectedClipId } = usePlayback();

  const clip = clips.find((c) => c.id === selectedClipId);

  return (
    <div className="glass scrollbar-thin flex h-full min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl p-4 shadow-elegant">
      <Section icon={<Sliders className="h-3.5 w-3.5" />} title="Editing">
        {clip ? (
          <>
            <div className="rounded-lg border border-border/50 bg-card/40 p-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Selected</span>
                <span className="font-mono tabular-nums">{formatTime(clip.trimEnd - clip.trimStart)}</span>
              </div>
              <div className="truncate text-sm font-medium">{clip.name}</div>
            </div>
            <RangeSlider
              label="Trim Start"
              value={clip.trimStart}
              max={clip.duration}
              suffix="s"
              onChange={(v) => updateTrim(clip.id, Math.min(v, clip.trimEnd - 0.5), clip.trimEnd)}
            />
            <RangeSlider
              label="Trim End"
              value={clip.trimEnd}
              max={clip.duration}
              suffix="s"
              onChange={(v) => updateTrim(clip.id, clip.trimStart, Math.max(v, clip.trimStart + 0.5))}
            />
            {/* Scene Audio Mute Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <Video className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Scene Audio</span>
              </div>
              <button
                onClick={() => toggleClipMute(clip.id)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  clip.muted
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {clip.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                {clip.muted ? 'Muted' : 'On'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => splitClip(clip.id)}>
                <Scissors className="mr-1.5 h-3.5 w-3.5" /> Split
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => removeClip(clip.id)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Select a clip to edit
          </div>
        )}
      </Section>

      <Section icon={<Mic className="h-3.5 w-3.5" />} title="Voiceover">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => {
            const f = event.target.files?.[0];
            if (f) addVoiceFile(f);
            // allow selecting the same file again
            event.currentTarget.value = "";
          }}
        />
        <div className="text-xs text-muted-foreground">
          {voiceFiles.length ? voiceFiles[voiceFiles.length - 1].name : "No file chosen"}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
          </Button>
          {recording ? (
            <Button size="sm" variant="destructive" onClick={stopRecording}>
              <Mic className="mr-1.5 h-3.5 w-3.5" /> Stop
            </Button>
          ) : (
            <Button size="sm" className="gradient-accent border-0 text-white" onClick={() => void startRecording()}>
              <Mic className="mr-1.5 h-3.5 w-3.5" /> Record
            </Button>
          )}
        </div>
        <RangeSlider
          label="Voice Volume"
          value={voiceVolume}
          max={100}
          suffix="%"
          onChange={setVoiceVolume}
          icon={
            <button
              onClick={() => setVoiceMuted(!voiceMuted)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Mute"
            >
              {voiceMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          }
        />
      </Section>

      <Section icon={<Music2 className="h-3.5 w-3.5" />} title="Background Music">
        <input
          ref={musicInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => setMusicFile(event.target.files?.[0] || null)}
        />
        <div className="text-xs text-muted-foreground">{musicFile ? musicFile.name : "No file chosen"}</div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => musicInputRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
          </Button>
          {musicFile ? (
            <Button size="sm" variant="ghost" onClick={() => setMusicFile(null)}>
              Remove
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled>
              Remove
            </Button>
          )}
        </div>
        <RangeSlider
          label="Music Volume"
          value={musicVolume}
          max={100}
          suffix="%"
          onChange={setMusicVolume}
        />
        <div className="rounded-lg border border-border/50 bg-card/40 p-2.5">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Mix</div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Voice</span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="absolute inset-y-0 left-0 gradient-primary"
                style={{ width: `${(voiceVolume / (voiceVolume + musicVolume || 1)) * 100}%` }}
              />
            </div>
            <span className="text-muted-foreground">Music</span>
          </div>
        </div>
      </Section>
    </div>
  );
});

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function RangeSlider({
  label,
  value,
  max,
  suffix,
  onChange,
  icon,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-mono tabular-nums text-foreground">
          {value.toFixed(suffix === "s" ? 1 : 0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={suffix === "s" ? 0.1 : 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
      />
    </div>
  );
}