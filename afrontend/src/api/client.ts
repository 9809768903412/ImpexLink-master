import axios from 'axios';

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL || '/api';
  if (typeof window === 'undefined') return configured;
  const appHost = window.location.hostname;
  const appIsLocal =
    appHost === 'localhost' ||
    appHost === '127.0.0.1' ||
    appHost === '::1' ||
    appHost === '[::1]';
  try {
    const url = new URL(configured, window.location.origin);
    const apiIsLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
    return apiIsLocal && !appIsLocal ? '/api' : configured;
  } catch {
    return configured || '/api';
  }
}

const baseURL = resolveApiBaseUrl();

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
