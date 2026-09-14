import { io } from 'socket.io-client';
import { API_BASE_URL } from '../api/axios.js';

let socket = null;
const listeners = new Map(); // event -> Set(handler)

function ensureSocket(token) {
  if (socket) return socket;

  socket = io(API_BASE_URL, {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
  });

  // Re-attach any handlers registered before connection existed
  listeners.forEach((handlers, event) => {
    handlers.forEach((handler) => socket.on(event, handler));
  });

  return socket;
}

export function connectSocket(token) {
  return ensureSocket(token);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}

export function subscribe(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  if (socket) socket.on(event, handler);

  return () => {
    listeners.get(event)?.delete(handler);
    if (socket) socket.off(event, handler);
  };
}

export function isConnected() {
  return Boolean(socket && socket.connected);
}
