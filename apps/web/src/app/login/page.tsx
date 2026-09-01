'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coffee, Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { APP_NAME, cn } from '@/lib/utils';
import { Button, Card, Field, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';

type Mode = 'password' | 'pin';

export default function LoginPage() {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const login = useAuth((s) => s.login);
  const loginWithPin = useAuth((s) => s.loginWithPin);

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'password') await login(email.trim(), password);
      else await loginWithPin(employeeCode.trim(), pin);

      toast.success('Welcome back');
      router.replace(mode === 'pin' ? '/pos' : '/dashboard');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-foreground/15">
            <Coffee className="h-6 w-6" />
          </span>
          <span className="text-lg font-semibold">{APP_NAME}</span>
        </div>

        <div className="max-w-md space-y-4">
          <h1 className="text-4xl font-bold leading-tight">Run your coffee shop with confidence.</h1>
          <p className="text-primary-foreground/80">
            Fast touch checkout, recipe-driven stock deduction, live profit tracking and offline resilience — built for
            busy counters.
          </p>
          <ul className="space-y-2 pt-2 text-sm text-primary-foreground/80">
            {['Ingredients deduct automatically on every sale', 'Keep selling when the internet drops', 'Daily profit and margin at a glance'].map(
              (line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-foreground/60" />
                  {line}
                </li>
              ),
            )}
          </ul>
        </div>

        <p className="text-xs text-primary-foreground/60">Multi-branch ready · Secure by default</p>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-sm">
          <div className="mb-7 text-center lg:text-left">
            <span className="mb-4 inline-grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground lg:hidden">
              <Coffee className="h-6 w-6" />
            </span>
            <h2 className="text-2xl font-bold">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'password' ? 'Use your work email and password.' : 'Quick access for cashiers on shift.'}
            </p>
          </div>

          <div role="tablist" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(
              [
                { value: 'password', label: 'Email', icon: Mail },
                { value: 'pin', label: 'Employee PIN', icon: KeyRound },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={mode === tab.value}
                onClick={() => {
                  setMode(tab.value);
                  setError(null);
                }}
                className={cn(
                  'inline-flex touch-target items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
                  mode === tab.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <Card className="p-5">
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {mode === 'password' ? (
                <>
                  <Field label="Email address" required>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@coffeeshop.com"
                      autoComplete="username"
                      required
                      autoFocus
                    />
                  </Field>

                  <Field label="Password" required>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                        className="pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Employee code" required>
                    <Input
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                      placeholder="EMP0002"
                      autoComplete="off"
                      required
                      autoFocus
                    />
                  </Field>

                  <Field label="PIN" hint="4 to 6 digits" required>
                    <Input
                      type="password"
                      inputMode="numeric"
                      pattern="\d{4,6}"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      autoComplete="off"
                      required
                      className="text-center text-2xl tracking-[0.5em]"
                    />
                  </Field>
                </>
              )}

              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" loading={submitting}>
                Sign in
              </Button>
            </form>
          </Card>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Trouble signing in? Ask your manager to reset your credentials.
          </p>
        </div>
      </div>
    </div>
  );
}
