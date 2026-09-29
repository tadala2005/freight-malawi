import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${BASE_URL.replace(/\/$/, '')}/api`,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('fm_token');
      localStorage.removeItem('fm_user');
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export function extractErrorMessage(err) {
  return err?.response?.data?.error?.message
    || err?.response?.data?.message
    || err?.message
    || 'Something went wrong. Please try again.';
}

export default api;
export { BASE_URL };
