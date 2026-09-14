import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthAPI } from '../api/endpoints.js';
import { connectSocket, disconnectSocket } from '../socket/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('fm_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await AuthAPI.me();
        setUser(data.user);
        connectSocket(token);
      } catch (err) {
        localStorage.removeItem('fm_token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await AuthAPI.login(username, password);
    localStorage.setItem('fm_token', data.token);
    setToken(data.token);
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const { data } = await AuthAPI.register(username, email, password);
    localStorage.setItem('fm_token', data.token);
    setToken(data.token);
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('fm_token');
    setToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
