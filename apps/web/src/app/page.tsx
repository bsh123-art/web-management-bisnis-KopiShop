'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Coffee } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';

export default function RootPage() {
  const status = useAuth((s) => s.status);
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
    else if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <span className="grid h-14 w-14 animate-pulse-soft place-items-center rounded-2xl bg-primary text-primary-foreground">
        <Coffee className="h-7 w-7" />
      </span>
    </div>
  );
}
