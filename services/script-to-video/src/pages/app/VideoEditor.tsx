import { useState, useEffect } from "react";
import TopBar from "@/components/editor/TopBar";
import MediaLibrary from "@/components/editor/MediaLibrary";
import PreviewPlayer from "@/components/editor/PreviewPlayer";
import Timeline from "@/components/editor/Timeline";
import ToolsPanel from "@/components/editor/ToolsPanel";
import ScriptToVoice from "@/components/editor/ScriptToVoice";
import ExportModal from "@/components/editor/ExportModal";
import { EditorProvider, useEditor, type LibraryItem } from "@/components/editor/editor-context";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// Helper to convert base64 to File
const base64ToFile = (base64Data: string, filename: string, mimeType: string): File => {
  const arr = base64Data.split(',');
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mimeType });
};

// Inner component that uses the editor context
function VideoEditorContent() {
  console.log('%c[VideoEditorContent] render', 'color:red');
  const {
    addToTimeline, 
    addVoiceFile, 
    updateProjectName, 
    clearAll,
    syncVoiceWithClips,
    clips,
    voiceFiles,
    voiceDurations,
    loadingLibrary 
  } = useEditor();
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [pendingVoiceCount, setPendingVoiceCount] = useState(0);

  // Load pending data from SceneToVideo
  useEffect(() => {
    const loadPendingData = async () => {
      const pendingData = localStorage.getItem('pendingEditorData');
      if (!pendingData) {
        setIsLoadingPending(false);
        return;
      }

      try {
        const data = JSON.parse(pendingData);
        
        if (data.clips && Array.isArray(data.clips)) {
          // Clear pending data first to prevent reload on refresh
          localStorage.removeItem('pendingEditorData');

          // Clear existing clips and voice files before adding new ones
          if (clips.length > 0) {
            clearAll();
          }

          // Add clips to timeline (each clip needs to be added as a LibraryItem)
          for (const clip of data.clips) {
            const libraryItem: LibraryItem = {
              id: clip.id,
              savedId: clip.id,
              name: clip.name,
              duration: clip.duration,
              thumbnail: clip.thumbnail || '',
              tag: clip.tag || 'scene',
              url: clip.url,
              source: clip.source || 'scene'
            };
            addToTimeline(libraryItem);
          }

          // Add voice files (convert from base64)
          if (data.voiceFiles && Array.isArray(data.voiceFiles)) {
            setPendingVoiceCount(data.voiceFiles.length);
            data.voiceFiles.forEach((voiceFileData, index) => {
              const file = base64ToFile(voiceFileData.data, voiceFileData.name, voiceFileData.type);
              // Use "replace" for first file to clear existing voice segments, "append" for rest
              addVoiceFile(file, { mode: index === 0 ? "replace" : "append" });
            });
          }

          // Set project name
          if (data.projectName) {
            updateProjectName(data.projectName);
          }

          toast.success(`Loaded ${data.clips.length} scenes into editor`);
        }
      } catch (error) {
        console.error('Error loading pending data:', error);
        toast.error('Failed to load scenes');
      } finally {
        setIsLoadingPending(false);
      }
    };

    // Wait for library to load first
    if (!loadingLibrary) {
      loadPendingData();
    }
  }, [loadingLibrary, addToTimeline, addVoiceFile, updateProjectName, clearAll, clips.length]);

  // Sync voice with clips after voice files are loaded and durations known
  useEffect(() => {
    if (pendingVoiceCount === 0) return;
    if (voiceFiles.length === 0) return;
    
    // Check if all voice durations are loaded
    const allDurationsLoaded = voiceFiles.every((_, idx) => 
      voiceDurations[idx] !== undefined && voiceDurations[idx] > 0
    );
    
    if (allDurationsLoaded && voiceFiles.length === pendingVoiceCount) {
      // Small delay to ensure all state is settled
      const timer = setTimeout(() => {
        syncVoiceWithClips();
        setPendingVoiceCount(0);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [voiceFiles, voiceDurations, pendingVoiceCount, syncVoiceWithClips]);

  if (isLoadingPending && loadingLibrary) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading editor...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid min-h-0 flex-1 min-w-0 grid-cols-12 gap-3 p-3">
        <aside className="col-span-3 min-h-0 min-w-0 xl:col-span-2">
          <MediaLibrary />
        </aside>
        <main className="col-span-6 flex min-h-0 min-w-0 flex-col xl:col-span-7">
          <PreviewPlayer />
        </main>
        <aside className="col-span-3 flex min-h-0 min-w-0 flex-col gap-3">
          <div className="flex-1 min-h-0 min-w-0">
            <ToolsPanel />
          </div>
          <div className="flex-shrink-0 min-w-0">
            <ScriptToVoice />
          </div>
        </aside>
      </div>
      <div className="px-3 pb-3 w-full min-w-0 shrink-0">
        <Timeline />
      </div>
    </>
  );
}

export default function VideoEditor() {
  const [exportOpen, setExportOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <EditorProvider>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
        <TopBar
          theme={theme}
          onToggleTheme={toggle}
          onExport={() => setExportOpen(true)}
        />
        <VideoEditorContent />
        <ExportModal open={exportOpen} onOpenChange={setExportOpen} />
      </div>
    </EditorProvider>
  );
}