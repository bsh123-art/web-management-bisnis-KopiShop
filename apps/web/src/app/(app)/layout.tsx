'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Coffee } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { AppShell } from '@/components/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="grid h-14 w-14 animate-pulse-soft place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Coffee className="h-7 w-7" />
          </span>
          <p className="text-sm text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
