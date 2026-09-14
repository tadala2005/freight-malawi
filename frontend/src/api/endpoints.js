import api from './axios.js';

export const AuthAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  register: (username, email, password) => api.post('/auth/register', { username, email, password }),
  me: () => api.get('/auth/me'),
};

export const VehicleAPI = {
  list: () => api.get('/vehicles'),
  create: (payload) => api.post('/vehicles', payload),
  remove: (id) => api.delete(`/vehicles/${id}`),
  history: (id, start, end) => api.get(`/vehicles/${id}/history`, { params: { start, end } }),
  report: (id, start, end) => api.get(`/vehicles/${id}/report`, { params: { start, end } }),
};

export const AlertAPI = {
  list: () => api.get('/alerts'),
  acknowledge: (id) => api.post(`/alerts/${id}/acknowledge`),
};
