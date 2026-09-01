'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Database, Download, Percent, Plus, Receipt, Save, Store, Trash2, Wallet } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { hasRole, useAuth } from '@/lib/auth-store';
import { cn, formatDate } from '@/lib/utils';
import type { AppSettings, Branch, PaymentMethod } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/data-table';
import { ConfirmDialog, Modal } from '@/components/modal';
import { ThemeToggle } from '@/components/theme-toggle';

const ALL_METHODS: PaymentMethod[] = ['CASH', 'QRIS', 'DEBIT_CARD', 'CREDIT_CARD', 'EWALLET', 'BANK_TRANSFER', 'VOUCHER'];

const TABS = [
  { id: 'store', label: 'Store', icon: Store },
  { id: 'money', label: 'Tax & pricing', icon: Percent },
  { id: 'payment', label: 'Payments', icon: Wallet },
  { id: 'receipt', label: 'Receipt', icon: Receipt },
  { id: 'branches', label: 'Branches', icon: Building2 },
  { id: 'backup', label: 'Backup', icon: Database },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const isAdmin = hasRole(user, 'ADMIN');

  const [tab, setTab] = useState<TabId>('store');
  const [draft, setDraft] = useState<AppSettings | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<AppSettings>('/platform/settings')).data,
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api.patch<AppSettings>('/platform/settings', patch),
    onSuccess: () => {
      toast.success('Settings saved');
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !draft) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setDraft({ ...draft, [key]: value });
  const dirty = JSON.stringify(draft) !== JSON.stringify(data);

  const visibleTabs = TABS.filter((t) => isAdmin || (t.id !== 'branches' && t.id !== 'backup'));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Store details, pricing rules and system configuration"
        actions={
          isAdmin && tab !== 'branches' && tab !== 'backup' ? (
            <Button onClick={() => save.mutate(draft)} loading={save.isPending} disabled={!dirty}>
              <Save className="h-4 w-4" />
              Save changes
            </Button>
          ) : undefined
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'inline-flex shrink-0 touch-target items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors',
              tab === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {!isAdmin && tab !== 'branches' && tab !== 'backup' && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Only administrators can change these settings.
        </p>
      )}

      <fieldset disabled={!isAdmin} className="space-y-4">
        {tab === 'store' && (
          <Card>
            <CardHeader title="Store details" description="Shown on receipts and reports" />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field label="Store name" className="sm:col-span-2">
                <Input value={draft.storeName} onChange={(e) => set('storeName', e.target.value)} maxLength={120} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Textarea value={draft.storeAddress} onChange={(e) => set('storeAddress', e.target.value)} rows={2} maxLength={255} />
              </Field>
              <Field label="Phone">
                <Input value={draft.storePhone} onChange={(e) => set('storePhone', e.target.value)} maxLength={32} />
              </Field>
              <Field label="Email">
                <Input type="email" value={draft.storeEmail} onChange={(e) => set('storeEmail', e.target.value)} maxLength={120} />
              </Field>
              <Field label="Order number prefix" hint="e.g. INV/BR01/20260901/0001">
                <Input value={draft.orderPrefix} onChange={(e) => set('orderPrefix', e.target.value.toUpperCase())} maxLength={8} />
              </Field>
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Appearance</span>
                <div>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </Card>
        )}

        {tab === 'money' && (
          <Card>
            <CardHeader title="Tax & pricing" description="These rules apply to every new sale" />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Toggle
                label="Charge tax"
                description="Adds tax to each order"
                checked={draft.taxEnabled}
                onChange={(v) => set('taxEnabled', v)}
              />
              <Toggle
                label="Prices include tax"
                description="Tax is extracted from the listed price instead of added"
                checked={draft.taxInclusive}
                onChange={(v) => set('taxInclusive', v)}
              />
              <Field label="Tax rate (%)" hint="Indonesian PPN is 11%">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={(draft.taxRate * 100).toFixed(1)}
                  onChange={(e) => set('taxRate', Number(e.target.value) / 100)}
                  className="tabular"
                />
              </Field>
              <Field label="Cash rounding" hint="Round totals to the nearest N. Use 0 to disable.">
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={draft.cashRounding}
                  onChange={(e) => set('cashRounding', Number(e.target.value))}
                  className="tabular"
                />
              </Field>
              <Toggle
                label="Service charge"
                description="Applied on top of the taxable amount"
                checked={draft.serviceChargeEnabled}
                onChange={(v) => set('serviceChargeEnabled', v)}
              />
              <Field label="Service charge (%)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={(draft.serviceChargeRate * 100).toFixed(1)}
                  onChange={(e) => set('serviceChargeRate', Number(e.target.value) / 100)}
                  className="tabular"
                  disabled={!draft.serviceChargeEnabled}
                />
              </Field>
              <Toggle
                label="Loyalty programme"
                description="Customers earn points on every purchase"
                checked={draft.loyaltyEnabled}
                onChange={(v) => set('loyaltyEnabled', v)}
              />
              <Field label="Spend per point" hint="Currency spent to earn one point">
                <Input
                  type="number"
                  min={0}
                  value={draft.loyaltyEarnRate}
                  onChange={(e) => set('loyaltyEarnRate', Number(e.target.value))}
                  className="tabular"
                  disabled={!draft.loyaltyEnabled}
                />
              </Field>
              <Toggle
                label="Low stock alerts"
                description="Notify staff when an ingredient hits its threshold"
                checked={draft.lowStockAlerts}
                onChange={(v) => set('lowStockAlerts', v)}
              />
            </div>
          </Card>
        )}

        {tab === 'payment' && (
          <Card>
            <CardHeader title="Payment methods" description="Only enabled methods appear at checkout" />
            <div className="space-y-4 p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ALL_METHODS.map((method) => {
                  const enabled = draft.enabledPaymentMethods.includes(method);
                  return (
                    <label
                      key={method}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-colors',
                        enabled ? 'border-primary bg-primary/5' : 'border-border',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          set(
                            'enabledPaymentMethods',
                            e.target.checked
                              ? [...draft.enabledPaymentMethods, method]
                              : draft.enabledPaymentMethods.filter((m) => m !== method),
                          )
                        }
                        className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium capitalize">{method.replace('_', ' ').toLowerCase()}</p>
                        <p className="text-xs text-muted-foreground">
                          Fee {((draft.paymentFees[method] ?? 0) * 100).toFixed(2)}%
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={((draft.paymentFees[method] ?? 0) * 100).toFixed(2)}
                        onChange={(e) =>
                          set('paymentFees', { ...draft.paymentFees, [method]: Number(e.target.value) / 100 })
                        }
                        onClick={(e) => e.preventDefault()}
                        className="tabular h-9 w-20"
                        aria-label={`${method} fee percentage`}
                      />
                    </label>
                  );
                })}
              </div>

              <Field label="QRIS merchant name">
                <Input value={draft.qrisMerchantName} onChange={(e) => set('qrisMerchantName', e.target.value)} maxLength={120} />
              </Field>
              <Field label="QRIS static payload" hint="Paste the EMVCo string from your acquirer — displayed at checkout">
                <Textarea value={draft.qrisStaticPayload} onChange={(e) => set('qrisStaticPayload', e.target.value)} rows={3} className="font-mono text-xs" />
              </Field>
            </div>
          </Card>
        )}

        {tab === 'receipt' && (
          <Card>
            <CardHeader title="Receipt" description="Printed on the 80mm thermal template" />
            <div className="space-y-3 p-4">
              <Field label="Logo URL" hint="Optional image printed at the top">
                <Input value={draft.receiptLogoUrl} onChange={(e) => set('receiptLogoUrl', e.target.value)} maxLength={500} />
              </Field>
              <Field label="Footer message">
                <Textarea value={draft.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} rows={3} maxLength={255} />
              </Field>
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Preview</p>
                <div className="mx-auto max-w-[280px] rounded bg-white p-4 font-mono text-[11px] leading-relaxed text-black shadow-sm">
                  <p className="text-center font-bold">{draft.storeName || 'Store name'}</p>
                  <p className="text-center text-[10px]">{draft.storeAddress || 'Store address'}</p>
                  <p className="my-2 border-t border-dashed border-black" />
                  <div className="flex justify-between">
                    <span>Latte × 1</span>
                    <span>32,000</span>
                  </div>
                  <p className="my-2 border-t border-dashed border-black" />
                  <div className="flex justify-between font-bold">
                    <span>TOTAL</span>
                    <span>35,520</span>
                  </div>
                  <p className="my-2 border-t border-dashed border-black" />
                  <p className="whitespace-pre-line text-center text-[10px]">{draft.receiptFooter || 'Thank you!'}</p>
                </div>
              </div>
            </div>
          </Card>
        )}
      </fieldset>

      {tab === 'branches' && isAdmin && <BranchesPanel />}
      {tab === 'backup' && isAdmin && <BackupPanel />}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function BranchesPanel() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', address: '', phone: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => (await api.get<(Branch & { _count: { users: number; orders: number } })[]>('/platform/branches')).data,
  });

  const create = useMutation({
    mutationFn: () => api.post('/platform/branches', { ...form, address: form.address || null, phone: form.phone || null }),
    onSuccess: () => {
      toast.success('Branch created');
      setCreating(false);
      setForm({ code: '', name: '', address: '', phone: '' });
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader
        title="Branches"
        description="Each branch keeps its own stock, orders and expenses"
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Add branch
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {data?.map((branch) => (
            <li key={branch.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{branch.name}</p>
                  {branch.isDefault && <Badge tone="primary">Default</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {branch.code} · {branch.address ?? 'No address'} · {branch._count.users} staff · {branch._count.orders} orders
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add branch"
        description="Existing ingredients are initialised at zero stock for the new branch"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!form.code || !form.name}>
              Create branch
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Branch code" required hint="Uppercase letters and digits, e.g. BR02">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={10} autoFocus />
          </Field>
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={255} />
          </Field>
          <Field label="Phone" className="sm:col-span-2">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={32} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

interface BackupEntry {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

function BackupPanel() {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<BackupEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => (await api.get<BackupEntry[]>('/platform/backups')).data,
  });

  const create = useMutation({
    mutationFn: (format: 'sql' | 'json') => api.post('/platform/backups', { format }),
    onSuccess: () => {
      toast.success('Backup created');
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (fileName: string) => api.delete(`/platform/backups/${encodeURIComponent(fileName)}`),
    onSuccess: () => {
      toast.success('Backup deleted');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const formatSize = (bytes: number) =>
    bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  return (
    <Card>
      <CardHeader
        title="Database backups"
        description="Snapshots are kept for 30 days, then pruned automatically"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => create.mutate('json')} loading={create.isPending}>
              JSON
            </Button>
            <Button size="sm" onClick={() => create.mutate('sql')} loading={create.isPending}>
              <Database className="h-4 w-4" />
              SQL dump
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          No backups yet. Create one before any major change.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((backup) => (
            <li key={backup.fileName} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{backup.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(backup.createdAt, true)} · {formatSize(backup.sizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={`Download ${backup.fileName}`}
                  onClick={() =>
                    downloadFile(`/platform/backups/${encodeURIComponent(backup.fileName)}/download`, backup.fileName)
                  }
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${backup.fileName}`}
                  onClick={() => setDeleting(backup)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.fileName)}
        title="Delete backup"
        message={`${deleting?.fileName} will be permanently removed from the server.`}
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
      />
    </Card>
  );
}
