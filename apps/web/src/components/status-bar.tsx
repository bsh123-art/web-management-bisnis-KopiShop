'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { api } from '@/lib/api';
import { pendingCount, syncPendingOrders } from '@/lib/offline';
import { cn, formatRelative } from '@/lib/utils';
import type { AppNotification, PageMeta } from '@/lib/types';
import { Badge, Button, EmptyState, Spinner } from './ui';
import { Modal } from './modal';

/** Tracks browser connectivity and drains the offline order queue. */
export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const refreshCount = async () => setQueued(await pendingCount().catch(() => 0));

  const runSync = async (announce = true) => {
    setSyncing(true);
    try {
      const report = await syncPendingOrders();
      if (report && announce) {
        if (report.synced > 0) toast.success(`${report.synced} offline order(s) synced`);
        if (report.failed > 0) toast.error(`${report.failed} order(s) could not sync — open Transactions to review`);
        await queryClient.invalidateQueries({ queryKey: ['orders'] });
        await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    } catch {
      if (announce) toast.error('Sync failed. We will retry automatically.');
    } finally {
      setSyncing(false);
      await refreshCount();
    }
  };

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshCount();

    const handleOnline = () => {
      setOnline(true);
      void runSync();
    };
    const handleOffline = () => {
      setOnline(false);
      toast.warning('You are offline. Sales will be saved on this device and synced later.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Safety net in case an `online` event was missed while the tab was hidden.
    const timer = setInterval(() => {
      void refreshCount();
      if (navigator.onLine) void runSync(false);
    }, 60_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, queued, syncing, sync: runSync, refreshCount };
}

export function ConnectionBadge() {
  const { online, queued, syncing, sync } = useOfflineSync();

  if (online && queued === 0) {
    return (
      <span className="hidden items-center gap-1.5 text-xs font-medium text-success sm:inline-flex" title="Connected">
        <Wifi className="h-3.5 w-3.5" />
        Online
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void sync()}
      disabled={!online || syncing}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
        online ? 'bg-warning/15 text-warning hover:bg-warning/25' : 'bg-destructive/10 text-destructive',
      )}
      title={online ? 'Click to sync now' : 'Working offline'}
    >
      {online ? (
        <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
      ) : (
        <CloudOff className="h-3.5 w-3.5" />
      )}
      {online ? `${queued} to sync` : `Offline${queued ? ` · ${queued} queued` : ''}`}
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get<AppNotification[]>('/platform/notifications', { pageSize: 20 });
      return { items: response.data, meta: response.meta as PageMeta & { unread: number } };
    },
    refetchInterval: 60_000,
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/platform/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.meta?.unread ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative touch-target inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : 'You are all caught up'}
        footer={
          <Button variant="outline" onClick={() => markAll.mutate()} loading={markAll.isPending} disabled={unread === 0}>
            Mark all as read
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !data?.items.length ? (
          <EmptyState icon={Bell} title="No notifications yet" description="Low-stock alerts and system messages appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((item) => (
              <li key={item.id} className={cn('flex gap-3 py-3', !item.readAt && 'bg-primary/5 -mx-2 rounded px-2')}>
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    item.severity === 'critical' ? 'bg-destructive' : item.severity === 'warning' ? 'bg-warning' : 'bg-primary',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(item.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.message}</p>
                  {item.type !== 'SYSTEM' && (
                    <Badge tone={item.severity === 'critical' ? 'danger' : 'warning'} className="mt-1.5">
                      {item.type.replace('_', ' ').toLowerCase()}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
