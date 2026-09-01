'use client';

import { create } from 'zustand';
import { api, setAccessToken, setBranchId } from './api';
import type { AuthUser, Role } from './types';

interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string) => Promise<void>;
  loginWithPin: (employeeCode: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

const applySession = (accessToken: string, user: AuthUser) => {
  setAccessToken(accessToken);
  setBranchId(user.branchId);
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  setUser: (user) => set({ user, status: user ? 'authenticated' : 'unauthenticated' }),

  login: async (email, password) => {
    const { data } = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', { email, password });
    applySession(data.accessToken, data.user);
    set({ user: data.user, status: 'authenticated' });
  },

  loginWithPin: async (employeeCode, pin) => {
    const { data } = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login/pin', { employeeCode, pin });
    applySession(data.accessToken, data.user);
    set({ user: data.user, status: 'authenticated' });
  },

  logout: async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setBranchId(null);
    set({ user: null, status: 'unauthenticated' });
  },

  /**
   * Restores a session on page load using the httpOnly refresh cookie — no
   * token is ever read from localStorage.
   */
  bootstrap: async () => {
    set({ status: 'loading' });
    const refreshed = await api.refresh();
    if (!refreshed) {
      set({ user: null, status: 'unauthenticated' });
      return;
    }
    try {
      const { data } = await api.get<AuthUser>('/auth/me');
      setBranchId(data.branchId);
      set({ user: data, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },
}));

const RANK: Record<Role, number> = { CASHIER: 1, MANAGER: 2, ADMIN: 3 };

export const hasRole = (user: AuthUser | null, minimum: Role): boolean =>
  !!user && RANK[user.role] >= RANK[minimum];
