import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import type { User, UserRole } from '@/types';
import { getMe, login as apiLogin, register as apiRegister, verifyOtp as apiVerifyOtp, verifyEmail as apiVerifyEmail } from '@/api/auth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    remember?: boolean
  ) => Promise<{ ok: boolean; requiresOtp?: boolean; devOtp?: string | null; message?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<boolean>;
  logout: () => void;
  register: (
    name: string,
    email: string,
    password: string,
    role: UserRole,
    companyName?: string,
    proofDoc?: File | null
  ) => Promise<{ ok: boolean; pending?: boolean; requiresVerification?: boolean; message?: string; devOtp?: string | null }>;
  verifyEmail: (email: string, otp: string) => Promise<boolean>;
  updateUser: (updates: Partial<User>) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const idleMinutes = Number(import.meta.env.VITE_IDLE_TIMEOUT_MIN || 30);
  const idleMs = Math.max(5, idleMinutes) * 60 * 1000;
  const idleKey = 'auth_last_active';
  const idleNoticeKey = 'auth_idle_logout';
  const rememberKey = 'auth_remember';
  const tokenKey = 'auth_token';

  const getStoredToken = () => {
    return localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey);
  };

  const storeToken = (token: string, remember?: boolean) => {
    if (remember) {
      localStorage.setItem(tokenKey, token);
      sessionStorage.removeItem(tokenKey);
      localStorage.setItem(rememberKey, 'true');
    } else {
      sessionStorage.setItem(tokenKey, token);
      localStorage.removeItem(tokenKey);
      localStorage.setItem(rememberKey, 'false');
    }
  };

  const login = useCallback(
    async (
      email: string,
      password: string,
      remember = true
    ): Promise<{ ok: boolean; requiresOtp?: boolean; error?: string; devOtp?: string | null; message?: string }> => {
    try {
      const data = await apiLogin(email, password);
      if ((data as any).requiresOtp) {
        return { ok: true, requiresOtp: true, devOtp: (data as any).devOtp ?? null, message: (data as any).message };
      }
      if (data.token) {
        storeToken(data.token, remember);
      }
      setUser(data.user);
      localStorage.setItem(idleKey, String(Date.now()));
      return { ok: true };
    } catch (err) {
      const message =
        (err as any)?.response?.data?.error ||
        (err as any)?.message ||
        'Login failed';
      return { ok: false, error: message };
    }
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string): Promise<boolean> => {
    try {
      const data = await apiVerifyOtp(email, otp);
      if (data.token) {
        const remember = localStorage.getItem(rememberKey) !== 'false';
        storeToken(data.token, remember);
      }
      setUser(data.user || null);
      localStorage.setItem(idleKey, String(Date.now()));
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(tokenKey);
    sessionStorage.removeItem(tokenKey);
    localStorage.removeItem(rememberKey);
    localStorage.removeItem(idleKey);
    setUser(null);
  }, []);

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      role: UserRole,
      companyName?: string,
      proofDoc?: File | null
    ): Promise<{ ok: boolean; pending?: boolean; requiresVerification?: boolean }> => {
      try {
        const data = await apiRegister({ name, email, password, role, companyName, proofDoc });
        if (data.token) {
          const remember = localStorage.getItem(rememberKey) !== 'false';
          storeToken(data.token, remember);
        }
        if (data.user) {
          setUser(data.user);
          localStorage.setItem(idleKey, String(Date.now()));
          return { ok: true };
        }
        if (data.pending || data.requiresVerification) {
          return {
            ok: true,
            pending: true,
            requiresVerification: Boolean(data.requiresVerification),
            message: data.message,
            devOtp: data.devOtp ?? null,
          };
        }
        return { ok: false };
      } catch (err) {
        console.error(err);
        return { ok: false };
      }
    },
    []
  );

  const verifyEmail = useCallback(async (email: string, otp: string): Promise<boolean> => {
    try {
      const data = await apiVerifyEmail(email, otp);
      return Boolean(data?.ok);
    } catch (err) {
      console.error(err);
      return false;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const me = await getMe();
      setUser(me);
      localStorage.setItem(idleKey, String(Date.now()));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    const updateActivity = () => {
      localStorage.setItem(idleKey, String(Date.now()));
    };
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, updateActivity, { passive: true }));
    const interval = window.setInterval(() => {
      const last = Number(localStorage.getItem(idleKey) || Date.now());
      if (Date.now() - last > idleMs) {
        localStorage.setItem(idleNoticeKey, String(Date.now()));
        logout();
      }
    }, 30 * 1000);
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, updateActivity));
      window.clearInterval(interval);
    };
  }, [user, logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        verifyOtp,
        logout,
        register,
        verifyEmail,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
