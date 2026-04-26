import { apiClient } from '@/api/client';
import type { User, UserRole } from '@/types';

export interface AuthResponse {
  token?: string;
  user?: User;
  pending?: boolean;
  requiresVerification?: boolean;
  message?: string;
  emailSent?: boolean;
  devOtp?: string | null;
}

export async function login(email: string, password: string) {
  const { data } = await apiClient.post<AuthResponse & { requiresOtp?: boolean }>('/auth/login', { email, password });
  return data;
}

export async function verifyOtp(email: string, otp: string) {
  const { data } = await apiClient.post<AuthResponse>('/auth/verify-otp', { email, otp });
  return data;
}

export async function resendOtp(email: string) {
  const { data } = await apiClient.post<{ ok: boolean; emailSent?: boolean; devOtp?: string | null }>('/auth/resend-otp', { email });
  return data;
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  companyName?: string;
  proofDoc?: File | null;
}) {
  const form = new FormData();
  form.append('name', payload.name);
  form.append('email', payload.email);
  form.append('password', payload.password);
  form.append('role', payload.role);
  if (payload.companyName) form.append('companyName', payload.companyName);
  if (payload.proofDoc) form.append('proofDoc', payload.proofDoc);
  const { data } = await apiClient.post<AuthResponse>('/auth/register', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function verifyEmail(email: string, otp: string) {
  const { data } = await apiClient.post<{ ok: boolean }>('/auth/verify-email', { email, otp });
  return data;
}

export async function resendVerification(email: string) {
  const { data } = await apiClient.post<{ ok: boolean }>('/auth/resend-verification', { email });
  return data;
}

export async function requestPasswordReset(email: string) {
  const { data } = await apiClient.post<{ ok: boolean }>('/auth/request-password-reset', { email });
  return data;
}

export async function resetPassword(email: string, otp: string, newPassword: string) {
  const { data } = await apiClient.post<{ ok: boolean }>('/auth/reset-password', { email, otp, newPassword });
  return data;
}

export async function getMe() {
  const { data } = await apiClient.get<User>('/auth/me');
  return data;
}
