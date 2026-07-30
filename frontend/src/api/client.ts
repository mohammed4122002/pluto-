import axios from "axios";

const TOKEN_KEY = "pluto_access_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// The frontend only ever talks to the backend API — never to Supabase
// or the AI service directly. Business logic and data access stay server-side.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      setToken(null);
      onUnauthorized?.();
    }
    return Promise.reject(err);
  },
);
