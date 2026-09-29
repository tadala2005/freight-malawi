import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, alertApi } from '../api/endpoints';
import { createSocket, disconnectSocket, getSocket } from '../socket/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('fm_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('fm_token'));
  const [connectionStatus, setConnectionStatus] = useState('offline'); // 'live' | 'offline' | 'reconnecting'
  const [notificationCount, setNotificationCount] = useState(0);
  const [latestAlerts, setLatestAlerts] = useState([]);
  const [loadingSession, setLoadingSession] = useState(true);

  const refreshBadge = useCallback(async () => {
    try {
      const data = await alertApi.badge();
      setNotificationCount(data.count);
      setLatestAlerts(data.latest || []);
    } catch (err) {
      // Non-fatal: badge just stays at its last known value.
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setLoadingSession(false);
      return;
    }
    let cancelled = false;
    authApi.me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        localStorage.setItem('fm_user', JSON.stringify(me));
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setToken(null);
        localStorage.removeItem('fm_token');
        localStorage.removeItem('fm_user');
      })
      .finally(() => !cancelled && setLoadingSession(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setConnectionStatus('offline');
      return undefined;
    }

    const socket = createSocket(token);
    setConnectionStatus('reconnecting');

    const onConnect = () => setConnectionStatus('live');
    const onDisconnect = () => setConnectionStatus('reconnecting');
    const onReconnectFailed = () => setConnectionStatus('offline');
    const onNotificationUpdate = (payload) => setNotificationCount(payload.count);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_failed', onReconnectFailed);
    socket.on('notification:update', onNotificationUpdate);

    refreshBadge();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect_failed', onReconnectFailed);
      socket.off('notification:update', onNotificationUpdate);
    };
  }, [token, refreshBadge]);

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials);
    localStorage.setItem('fm_token', data.token);
    localStorage.setItem('fm_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await authApi.register(payload);
    localStorage.setItem('fm_token', data.token);
    localStorage.setItem('fm_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('fm_token');
    localStorage.removeItem('fm_user');
    disconnectSocket();
    setToken(null);
    setUser(null);
    setNotificationCount(0);
    setLatestAlerts([]);
  }, []);

  const value = useMemo(() => ({
    user, token, isAuthenticated: !!token, loadingSession,
    login, register, logout,
    connectionStatus, notificationCount, latestAlerts, refreshBadge,
    getSocket,
  }), [user, token, loadingSession, login, register, logout, connectionStatus, notificationCount, latestAlerts, refreshBadge]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
