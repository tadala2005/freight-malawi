import api from './axios';

// --- Auth ---
export const authApi = {
  register: (data) => api.post('/auth/register', data).then((r) => r.data.data),
  login: (data) => api.post('/auth/login', data).then((r) => r.data.data),
  me: () => api.get('/auth/me').then((r) => r.data.data),
};

// --- Vehicles ---
export const vehicleApi = {
  list: () => api.get('/vehicles').then((r) => r.data.data),
  get: (id) => api.get(`/vehicles/${id}`).then((r) => r.data.data),
  create: (data) => api.post('/vehicles', data).then((r) => r.data.data),
  update: (id, data) => api.put(`/vehicles/${id}`, data).then((r) => r.data.data),
  remove: (id) => api.delete(`/vehicles/${id}`).then((r) => r.data.data),
  telemetry: (id, params) => api.get(`/vehicles/${id}/telemetry`, { params }).then((r) => r.data.data),
  history: (id, params) => api.get(`/vehicles/${id}/history`, { params }).then((r) => r.data.data),
  report: (id, params) => api.get(`/vehicles/${id}/report`, { params }).then((r) => r.data.data),
  setIgnition: (id, ignition_on) => api.post(`/vehicles/${id}/ignition`, { ignition_on }).then((r) => r.data.data),
};

// --- Trips ---
export const tripApi = {
  list: (params) => api.get('/trips', { params }).then((r) => r.data.data),
  routes: () => api.get('/trips/routes').then((r) => r.data.data),
  create: (data) => api.post('/trips', data).then((r) => r.data.data),
  get: (id) => api.get(`/trips/${id}`).then((r) => r.data.data),
  saveDetails: (id, data) => api.post(`/trips/${id}/details`, data).then((r) => r.data.data),
  update: (id, data) => api.put(`/trips/${id}`, data).then((r) => r.data.data),
  complete: (id) => api.post(`/trips/${id}/complete`).then((r) => r.data.data),
  telemetry: (id) => api.get(`/trips/${id}/telemetry`).then((r) => r.data.data),
  listExpenses: (id) => api.get(`/trips/${id}/expenses`).then((r) => r.data.data),
  addExpense: (id, data) => api.post(`/trips/${id}/expenses`, data).then((r) => r.data.data),
};

export const expenseApi = {
  update: (id, data) => api.put(`/expenses/${id}`, data).then((r) => r.data.data),
  remove: (id) => api.delete(`/expenses/${id}`).then((r) => r.data.data),
};

// --- Alerts ---
export const alertApi = {
  list: (params) => api.get('/alerts', { params }).then((r) => r.data.data),
  badge: () => api.get('/alerts/badge').then((r) => r.data.data),
  acknowledge: (id) => api.post(`/alerts/${id}/acknowledge`).then((r) => r.data.data),
};

// --- Reports ---
export const reportApi = {
  fleet: (params) => api.get('/reports/fleet', { params }).then((r) => r.data.data),
  trips: (params) => api.get('/reports/trips', { params }).then((r) => r.data.data),
};

// --- Devices ---
export const deviceApi = {
  status: (vehicleId) => api.get(`/devices/${vehicleId}/status`).then((r) => r.data.data),
};
