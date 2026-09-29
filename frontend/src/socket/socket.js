import { io } from 'socket.io-client';

let socket;

function socketBaseUrl() {
  const configured = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  return configured ? configured.replace(/\/$/, '') : window.location.origin;
}

export function createSocket(token) {
  if (!token) return null;
  if (socket) socket.disconnect();
  socket = io(socketBaseUrl(), {
    transports: ['websocket', 'polling'],
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
  return socket;
}

export function getSocket() { return socket; }

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
