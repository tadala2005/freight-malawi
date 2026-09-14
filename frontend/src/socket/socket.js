import { io } from 'socket.io-client';
import { API_BASE_URL } from '../api/axios.js';

const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL || API_BASE_URL).trim().replace(/\/+$/, '');

let socket = null;
const listeners = new Map();

function ensureSocket(token) {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    transports: ['websocket', 'polling'],
  });

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
