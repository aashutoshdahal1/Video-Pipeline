import { io } from 'socket.io-client';

export const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

export function joinJob(jobId: string) {
  socket.emit('join:job', jobId);
}

export function leaveJob(jobId: string) {
  socket.emit('leave:job', jobId);
}
