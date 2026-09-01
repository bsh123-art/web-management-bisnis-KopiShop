'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Download, Printer, Receipt as ReceiptIcon, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { hasRole, useAuth } from '@/lib/auth-store';
import { exportToExcel, exportToPdf } from '@/lib/export';
import { printReceipt } from '@/lib/receipt';
import { useRealtime } from '@/lib/use-realtime';
import { cn, formatCurrency, formatDate, formatNumber, toISODate } from '@/lib/utils';
import type { Order, OrderStatus, PageMeta, PaymentMethod, Receipt } from '@/lib/types';
import { Badge, Button, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { Column, DataTable, PageHeader, SearchInput, StatCard } from '@/components/data-table';
import { Modal } from '@/components/modal';

const STATUS_TONES: Record<OrderStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  COMPLETED: 'success',
  VOIDED: 'danger',
  REFUNDED: 'warning',
  PENDING: 'neutral',
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  QRIS: 'QRIS',
  DEBIT_CARD: 'Debit',
  CREDIT_CARD: 'Credit',
  EWALLET: 'E-Wallet',
  BANK_TRANSFER: 'Transfer',
  VOUCHER: 'Voucher',
};

export default function TransactionsPage() {
  useRealtime();
  const user = useAuth((s) => s.user);
  const canReverse = hasRole(user, 'MANAGER');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(toISODate(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(toISODate(new Date()));
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Order | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', { search, status, from, to, page }],
    queryFn: async () => {
      const response = await api.get<Order[]>('/orders', {
        search,
        status,
        from: from ? `${from}T00:00:00` : undefined,
        to: to ? `${to}T23:59:59` : undefined,
        page,
        pageSize: 25,
      });
      return { items: response.data, meta: response.meta as PageMeta & { revenue: number; cost: number } };
    },
  });

  const orders = data?.items ?? [];
  const revenue = data?.meta?.revenue ?? 0;
  const cost = data?.meta?.cost ?? 0;

  const columns: Column<Order>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.orderNumber}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatDate(row.createdAt, true)} · {row.cashier.fullName}
          </p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      align: 'center',
      hideBelow: 'sm',
      render: (row) => formatNumber(row.items.reduce((acc, item) => acc + item.quantity, 0)),
    },
    {
      key: 'customer',
      header: 'Customer',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.customer?.name ?? 'Walk-in'}</span>,
    },
    {
      key: 'payment',
      header: 'Payment',
      hideBelow: 'md',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.payments.map((payment) => (
            <Badge key={payment.id} tone="neutral">
              {PAYMENT_LABELS[payment.method]}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (row) => (
        <span className={cn('font-semibold', row.status !== 'COMPLETED' && 'text-muted-foreground line-through')}>
          {formatCurrency(row.total)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => <Badge tone={STATUS_TONES[row.status]}>{row.status.toLowerCase()}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transactions"
        description="Complete sales history with receipts, voids and refunds"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToPdf(
                  orders,
                  [
                    { header: 'Order', value: (o) => o.orderNumber },
                    { header: 'Date', value: (o) => formatDate(o.createdAt, true) },
                    { header: 'Cashier', value: (o) => o.cashier.fullName },
                    { header: 'Customer', value: (o) => o.customer?.name ?? 'Walk-in' },
                    { header: 'Total', value: (o) => formatCurrency(o.total) },
                    { header: 'Status', value: (o) => o.status },
                  ],
                  `transactions-${from}_${to}`,
                  { title: 'Transaction Report', subtitle: `${from} to ${to}` },
                )
              }
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                exportToExcel(
                  orders,
                  [
                    { header: 'Order', value: (o) => o.orderNumber },
                    { header: 'Date', value: (o) => formatDate(o.createdAt, true) },
                    { header: 'Cashier', value: (o) => o.cashier.fullName },
                    { header: 'Customer', value: (o) => o.customer?.name ?? 'Walk-in' },
                    { header: 'Channel', value: (o) => o.channel },
                    { header: 'Subtotal', value: (o) => o.subtotal },
                    { header: 'Discount', value: (o) => o.discountAmount },
                    { header: 'Tax', value: (o) => o.taxAmount },
                    { header: 'Total', value: (o) => o.total },
                    { header: 'Cost', value: (o) => o.costTotal },
                    { header: 'Profit', value: (o) => o.total - o.taxAmount - o.costTotal },
                    { header: 'Status', value: (o) => o.status },
                  ],
                  `transactions-${from}_${to}`,
                  'Transactions',
                )
              }
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Orders" value={formatNumber(data?.meta?.total ?? 0)} />
        <StatCard label="Revenue" value={formatCurrency(revenue)} />
        <StatCard label="Cost of goods" value={formatCurrency(cost)} />
        <StatCard label="Gross profit" value={formatCurrency(revenue - cost)} tone="success" />
      </div>

      <div className="flex flex-wrap gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Order number, customer, product…" className="min-w-[220px] flex-1" />
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-auto" aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-auto" aria-label="To date" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-auto min-w-[150px]" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="VOIDED">Voided</option>
          <option value="REFUNDED">Refunded</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        loading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={setDetail}
        meta={data?.meta}
        onPageChange={setPage}
        emptyIcon={ReceiptIcon}
        emptyTitle="No transactions in this period"
        emptyDescription="Adjust the date range or make a sale from the POS."
      />

      {detail && <OrderDetail order={detail} canReverse={canReverse} onClose={() => setDetail(null)} />}
    </div>
  );
}

function OrderDetail({ order, canReverse, onClose }: { order: Order; canReverse: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<'void' | 'refund' | null>(null);
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);

  const receiptQuery = useQuery({
    queryKey: ['receipt', order.id],
    queryFn: async () => (await api.get<Receipt>(`/orders/${order.id}/receipt`)).data,
  });

  const reverse = useMutation({
    mutationFn: () => api.post(`/orders/${order.id}/${action}`, { reason, restock }),
    onSuccess: () => {
      toast.success(action === 'void' ? 'Order voided' : 'Order refunded');
      setAction(null);
      onClose();
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const profit = order.total - order.taxAmount - order.costTotal;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={order.orderNumber}
        description={`${formatDate(order.createdAt, true)} · ${order.cashier.fullName}`}
        size="lg"
        footer={
          <>
            {canReverse && order.status === 'COMPLETED' && (
              <>
                <Button variant="outline" onClick={() => { setAction('refund'); setRestock(false); }}>
                  <RotateCcw className="h-4 w-4" />
                  Refund
                </Button>
                <Button variant="destructive" onClick={() => { setAction('void'); setRestock(true); }}>
                  <Ban className="h-4 w-4" />
                  Void
                </Button>
              </>
            )}
            <Button
              onClick={() => receiptQuery.data && printReceipt(receiptQuery.data)}
              disabled={!receiptQuery.data}
              loading={receiptQuery.isLoading}
            >
              <Printer className="h-4 w-4" />
              Print receipt
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_TONES[order.status]}>{order.status.toLowerCase()}</Badge>
            <Badge tone="neutral">{order.channel.replace('_', ' ').toLowerCase()}</Badge>
            {order.tableNumber && <Badge tone="neutral">Table {order.tableNumber}</Badge>}
            {order.customer && <Badge tone="primary">{order.customer.name}</Badge>}
          </div>

          {order.voidReason && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <strong>Reason:</strong> {order.voidReason}
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-center">Qty</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">
                        {item.productName}
                        {item.variantName && <span className="text-muted-foreground"> · {item.variantName}</span>}
                      </p>
                      {item.note && <p className="text-xs italic text-muted-foreground">↳ {item.note}</p>}
                    </td>
                    <td className="tabular px-3 py-2 text-center">{item.quantity}</td>
                    <td className="tabular px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="tabular px-3 py-2 text-right font-medium">{formatCurrency(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
            <Line label="Subtotal" value={formatCurrency(order.subtotal)} />
            {order.discountAmount > 0 && <Line label="Discount" value={`−${formatCurrency(order.discountAmount)}`} />}
            {order.serviceAmount > 0 && <Line label="Service charge" value={formatCurrency(order.serviceAmount)} />}
            {order.taxAmount > 0 && <Line label="Tax" value={formatCurrency(order.taxAmount)} />}
            {order.roundingAmount !== 0 && <Line label="Rounding" value={formatCurrency(order.roundingAmount)} />}
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-bold">
              <span>Total</span>
              <span className="tabular">{formatCurrency(order.total)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Payments</p>
              <ul className="space-y-1 text-sm">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="flex justify-between">
                    <span>{PAYMENT_LABELS[payment.method]}</span>
                    <span className="tabular font-medium">{formatCurrency(payment.amount)}</span>
                  </li>
                ))}
                {order.changeAmount > 0 && (
                  <li className="flex justify-between border-t border-border pt-1 text-success">
                    <span>Change</span>
                    <span className="tabular font-medium">{formatCurrency(order.changeAmount)}</span>
                  </li>
                )}
              </ul>
            </div>

            {canReverse && (
              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Profitability</p>
                <ul className="space-y-1 text-sm">
                  <Line label="Cost of goods" value={formatCurrency(order.costTotal)} />
                  <Line label="Gross profit" value={formatCurrency(profit)} />
                  <li className="flex justify-between border-t border-border pt-1">
                    <span className="text-muted-foreground">Margin</span>
                    <span className="tabular font-medium text-success">
                      {order.total > 0 ? ((profit / order.total) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {receiptQuery.isLoading && (
            <div className="flex justify-center">
              <Spinner />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!action}
        onClose={() => setAction(null)}
        title={action === 'void' ? 'Void order' : 'Refund order'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAction(null)} disabled={reverse.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => reverse.mutate()}
              loading={reverse.isPending}
              disabled={reason.trim().length < 3}
            >
              Confirm {action}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Reason" hint="Recorded in the audit log" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} rows={3} autoFocus />
          </Field>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={restock}
              onChange={(e) => setRestock(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
            />
            <span>
              Return ingredients to stock
              <span className="block text-xs text-muted-foreground">
                Leave unticked if the drinks were already made and discarded.
              </span>
            </span>
          </label>
        </div>
      </Modal>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}
