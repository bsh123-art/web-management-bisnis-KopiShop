'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, QrCode, Smartphone, Trash2, Wallet } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { PaymentMethod } from '@/lib/types';
import { Badge, Button, Field, Input } from '@/components/ui';
import { Modal } from '@/components/modal';

const METHOD_META: Record<PaymentMethod, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  CASH: { label: 'Cash', icon: Banknote },
  QRIS: { label: 'QRIS', icon: QrCode },
  DEBIT_CARD: { label: 'Debit', icon: CreditCard },
  CREDIT_CARD: { label: 'Credit', icon: CreditCard },
  EWALLET: { label: 'E-Wallet', icon: Smartphone },
  BANK_TRANSFER: { label: 'Transfer', icon: Wallet },
  VOUCHER: { label: 'Voucher', icon: Wallet },
};

export interface PaymentEntry {
  method: PaymentMethod;
  amount: number;
  referenceNo?: string;
}

/** Denominations offered as quick-tender buttons. */
const suggestCash = (total: number): number[] => {
  const steps = [1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];
  const suggestions = new Set<number>([Math.ceil(total / 1000) * 1000]);
  for (const step of steps) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded >= total) suggestions.add(rounded);
  }
  return [...suggestions].sort((a, b) => a - b).slice(0, 6);
};

export function PaymentModal({
  open,
  onClose,
  total,
  enabledMethods,
  qrisPayload,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  enabledMethods: PaymentMethod[];
  qrisPayload?: string;
  submitting: boolean;
  onConfirm: (payments: PaymentEntry[]) => void;
}) {
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [method, setMethod] = useState<PaymentMethod>(enabledMethods[0] ?? 'CASH');
  const [amountInput, setAmountInput] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (!open) return;
    setPayments([]);
    setMethod(enabledMethods[0] ?? 'CASH');
    setAmountInput('');
    setReference('');
  }, [open, enabledMethods]);

  const paid = useMemo(() => payments.reduce((acc, p) => acc + p.amount, 0), [payments]);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const settled = paid >= total && total > 0;

  const addPayment = (amount: number, forMethod: PaymentMethod = method) => {
    if (amount <= 0) return;
    setPayments((current) => [
      ...current,
      { method: forMethod, amount, referenceNo: reference.trim() || undefined },
    ]);
    setAmountInput('');
    setReference('');
  };

  const parsedAmount = Number(amountInput.replace(/[^\d.]/g, '')) || 0;
  const needsReference = method !== 'CASH';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take payment"
      description={`Amount due ${formatCurrency(total)}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="success" size="lg" disabled={!settled} loading={submitting} onClick={() => onConfirm(payments)}>
            Complete sale · {formatCurrency(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/60 p-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="tabular text-lg font-bold">{formatCurrency(total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="tabular text-lg font-bold text-primary">{formatCurrency(paid)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{change > 0 ? 'Change' : 'Remaining'}</p>
            <p className={cn('tabular text-lg font-bold', change > 0 ? 'text-success' : 'text-destructive')}>
              {formatCurrency(change > 0 ? change : remaining)}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Payment method</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {enabledMethods.map((value) => {
              const meta = METHOD_META[value];
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMethod(value)}
                  aria-pressed={method === value}
                  className={cn(
                    'flex touch-target flex-col items-center justify-center gap-1 rounded-lg border-2 p-3 text-xs font-medium transition-colors',
                    method === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted',
                  )}
                >
                  <meta.icon className="h-5 w-5" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {method === 'QRIS' && qrisPayload && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
            <QrCode className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 text-sm font-medium">Show the QRIS code to the customer</p>
            <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{qrisPayload.slice(0, 80)}…</p>
          </div>
        )}

        {method === 'CASH' && remaining > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Quick cash</p>
            <div className="grid grid-cols-3 gap-2">
              {suggestCash(remaining).map((amount) => (
                <Button key={amount} variant="outline" onClick={() => addPayment(amount, 'CASH')} className="tabular">
                  {formatCurrency(amount)}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Amount" className="min-w-0">
            <Input
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder={String(remaining)}
              className="tabular text-lg"
            />
          </Field>
          <Button
            onClick={() => addPayment(parsedAmount || remaining)}
            disabled={remaining <= 0 && parsedAmount <= 0}
            className="sm:mb-0"
          >
            Add payment
          </Button>
        </div>

        {needsReference && (
          <Field label="Reference number" hint="Optional — EDC approval code or transaction ID">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 8829301" maxLength={120} />
          </Field>
        )}

        {payments.length > 0 && (
          <div className="rounded-lg border border-border">
            <p className="border-b border-border px-3 py-2 text-sm font-medium">Tendered</p>
            <ul className="divide-y divide-border">
              {payments.map((payment, index) => (
                <li key={`${payment.method}-${index}`} className="flex items-center gap-3 px-3 py-2">
                  <Badge tone="primary">{METHOD_META[payment.method].label}</Badge>
                  <span className="tabular flex-1 text-sm font-medium">{formatCurrency(payment.amount)}</span>
                  {payment.referenceNo && (
                    <span className="truncate font-mono text-xs text-muted-foreground">#{payment.referenceNo}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove payment"
                    onClick={() => setPayments((current) => current.filter((_, i) => i !== index))}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
