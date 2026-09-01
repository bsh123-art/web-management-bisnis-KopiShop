'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { API_URL, getAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

/**
 * Subscribes to server push events and invalidates the affected caches so the
 * dashboard, stock screens and transaction list stay live without polling.
 */
export function useRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);

  useEffect(() => {
    if (!enabled || !user) return;

    const token = getAccessToken();
    if (!token) return;

    const socket: Socket = io(API_URL, {
      path: '/realtime',
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('order:created', () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    });

    socket.on('order:voided', () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    });

    socket.on('stock:changed', () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    });

    socket.on('stock:low', (payload: { title?: string; message?: string; severity?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      const notify = payload.severity === 'critical' ? toast.error : toast.warning;
      notify(payload.title ?? 'Stock alert', { description: payload.message });
    });

    socket.on('notification:new', () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled, user, queryClient]);
}
