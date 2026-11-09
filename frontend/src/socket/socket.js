
import { io } from 'socket.io-client';

let socket = null;

function getBackendUrl() {
  const url =
    import.meta.env.VITE_SOCKET_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    window.location.origin;

  return url.replace(/\/$/, '');
}

export function createSocket(token) {
  if (!token) {
    return null;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(getBackendUrl(), {
    transports: ['polling'],
    auth: {
      token
    },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('[SOCKET] Connected');
  });

  socket.on('disconnect', (reason) => {
    console.warn('[SOCKET] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error(
      '[SOCKET] Connection failed:',
      error.message
    );
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
