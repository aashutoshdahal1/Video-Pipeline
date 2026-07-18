import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

export interface Job {
  _id: string;
  title: string;
  voicePrompt: string;
  voiceName: string;
  audioUrl?: string;
  transcript?: string;
  transcriptSegments?: string[];
  imagePrompts: ImagePrompt[];
  stage: 'tts' | 'transcribing' | 'prompts' | 'images' | 'timeline' | 'done';
  status: 'idle' | 'processing' | 'error' | 'complete';
  error?: string;
  scriptToVideoProjectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImagePrompt {
  _id?: string;
  prompt: string;
  aspect: string;
  count: number;
  status: 'pending' | 'generating' | 'done' | 'failed';
  urls?: string[];
  error?: string;
}

export const jobsApi = {
  list: () => api.get<Job[]>('/jobs').then(r => r.data),
  get: (id: string) => api.get<Job>(`/jobs/${id}`).then(r => r.data),
  create: (data: { title?: string; voicePrompt: string; voiceName?: string }) =>
    api.post<Job>('/jobs', data).then(r => r.data),
  delete: (id: string) => api.delete(`/jobs/${id}`),
  runTTS: (id: string, voiceFile?: File, voiceName?: string) => {
    if (voiceFile) {
      const form = new FormData();
      form.append('voice_wav', voiceFile);
      return api.post<Job>(`/jobs/${id}/tts`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }).then(r => r.data);
    }
    return api.post<Job>(`/jobs/${id}/tts`, voiceName ? { voiceName } : undefined).then(r => r.data);
  },
  runTranscribe: (id: string, model?: string) =>
    api.post(`/jobs/${id}/transcribe`, { model }).then(r => r.data),
  savePrompts: (id: string, prompts: Omit<ImagePrompt, '_id' | 'status' | 'urls' | 'error'>[]) =>
    api.put<Job>(`/jobs/${id}/prompts`, { prompts }).then(r => r.data),
  startImages: (id: string) => api.post<Job>(`/jobs/${id}/images/start`).then(r => r.data),
  reportImage: (id: string, index: number, result: { status: string; urls?: string[]; error?: string }) =>
    api.patch(`/jobs/${id}/images/${index}`, result).then(r => r.data),
  resetJob: (id: string) => api.post<Job>(`/jobs/${id}/reset`).then(r => r.data),
};

export const voicesApi = {
  list: () => api.get<string[]>('/voices').then(r => r.data)
};
