import { useEffect, useRef } from 'react';
import { socket, joinJob, leaveJob } from '../lib/socket';

export interface JobUpdate {
  stage: string;
  status: string;
  message: string;
  [key: string]: unknown;
}

export function useJobSocket(
  jobId: string | undefined,
  onUpdate: (update: JobUpdate) => void,
  onImageResult?: (result: { index: number; status: string; urls: string[]; error?: string }) => void
) {
  const cbRef = useRef(onUpdate);
  const imgRef = useRef(onImageResult);
  cbRef.current = onUpdate;
  imgRef.current = onImageResult;

  useEffect(() => {
    if (!jobId) return;
    joinJob(jobId);

    const handleUpdate = (data: JobUpdate) => cbRef.current(data);
    const handleImg = (data: any) => imgRef.current?.(data);

    socket.on('job:update', handleUpdate);
    socket.on('job:imageResult', handleImg);

    return () => {
      leaveJob(jobId);
      socket.off('job:update', handleUpdate);
      socket.off('job:imageResult', handleImg);
    };
  }, [jobId]);
}
