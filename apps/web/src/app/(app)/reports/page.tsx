'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileSpreadsheet } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { exportToPdf } from '@/lib/export';
import { cn, formatCompact, formatCurrency, formatNumber, formatPercent, toISODate } from '@/lib/utils';
import type { PeriodSummary, SalesPoint } from '@/lib/types';
import { Button, Card, CardHeader, EmptyState, Select, Spinner } from '@/components/ui';
import { PageHeader, StatCard } from '@/components/data-table';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisYear', label: 'This year' },
] as const;

const COLORS = ['#8B5E3C', '#C08552', '#7BA05B', '#D4A574', '#5C4033', '#A9746E', '#9C6644'];

const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    color: 'hsl(var(--card-foreground))',
    fontSize: 12,
  },
};

interface TopProduct {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: number;
}
interface CategoryRow {
  categoryId: string;
  name: string;
  color: string;
  revenue: number;
  quantity: number;
}
interface CashierRow {
  cashier: { id: string; fullName: string; employeeCode: string };
  orders: number;
  revenue: number;
  averageTicket: number;
}
interface ExpenseRow {
  categoryId: string;
  name: string;
  isFixed: boolean;
  count: number;
  amount: number;
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<string>('last30');
  const [exporting, setExporting] = useState(false);

  const params = { preset };

  const summaryQuery = useQuery({
    queryKey: ['report-summary', preset],
    queryFn: async () => (await api.get<PeriodSummary>('/reports/summary', params)).data,
  });

  const seriesQuery = useQuery({
    queryKey: ['report-series', preset],
    queryFn: async () => (await api.get<SalesPoint[]>('/reports/sales-series', { ...params, granularity: 'day' })).data,
  });

  const productsQuery = useQuery({
    queryKey: ['report-products', preset],
    queryFn: async () => (await api.get<TopProduct[]>('/reports/top-products', params)).data,
  });

  const categoriesQuery = useQuery({
    queryKey: ['report-categories', preset],
    queryFn: async () => (await api.get<CategoryRow[]>('/reports/categories', params)).data,
  });

  const cashiersQuery = useQuery({
    queryKey: ['report-cashiers', preset],
    queryFn: async () => (await api.get<CashierRow[]>('/reports/cashiers', params)).data,
  });

  const expensesQuery = useQuery({
    queryKey: ['report-expenses', preset],
    queryFn: async () => (await api.get<ExpenseRow[]>('/reports/expenses', params)).data,
  });

  const summary = summaryQuery.data;

  const handleWorkbook = async () => {
    setExporting(true);
    try {
      await downloadFile('/reports/export', `kopi-report-${preset}-${toISODate(new Date())}.xlsx`, params);
    } finally {
      setExporting(false);
    }
  };

  if (summaryQuery.isLoading || !summary) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const trend = (seriesQuery.data ?? []).map((point) => ({
    date: new Date(point.bucket).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
    revenue: point.revenue,
    profit: point.profit,
    orders: point.orders,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Profit and loss, product performance and staff productivity"
        actions={
          <>
            <Select value={preset} onChange={(e) => setPreset(e.target.value)} className="w-auto min-w-[150px]" aria-label="Reporting period">
              {PRESETS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              onClick={() =>
                exportToPdf(
                  [
                    { metric: 'Orders', value: formatNumber(summary.orders.count) },
                    { metric: 'Items sold', value: formatNumber(summary.orders.itemsSold) },
                    { metric: 'Average ticket', value: formatCurrency(summary.orders.averageTicket) },
                    { metric: 'Gross sales', value: formatCurrency(summary.revenue.grossSales) },
                    { metric: 'Discounts', value: formatCurrency(summary.revenue.discounts) },
                    { metric: 'Net revenue', value: formatCurrency(summary.revenue.netRevenue) },
                    { metric: 'Cost of goods sold', value: formatCurrency(summary.costs.cogs) },
                    { metric: 'Operating expenses', value: formatCurrency(summary.costs.operatingExpenses) },
                    { metric: 'Payment fees', value: formatCurrency(summary.costs.paymentFees) },
                    { metric: 'Gross profit', value: formatCurrency(summary.profit.grossProfit) },
                    { metric: 'Net profit', value: formatCurrency(summary.profit.netProfit) },
                    { metric: 'Net margin', value: formatPercent(summary.profit.netMarginPercent) },
                  ],
                  [
                    { header: 'Metric', value: (r) => r.metric },
                    { header: 'Value', value: (r) => r.value },
                  ],
                  `profit-loss-${preset}`,
                  { title: 'Profit & Loss Statement', subtitle: PRESETS.find((p) => p.value === preset)?.label },
                )
              }
            >
              <Download className="h-4 w-4" />
              P&L PDF
            </Button>
            <Button onClick={handleWorkbook} loading={exporting}>
              <FileSpreadsheet className="h-4 w-4" />
              Full workbook
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net revenue" value={formatCurrency(summary.revenue.netRevenue)} hint={`${formatNumber(summary.orders.count)} orders`} />
        <StatCard label="Gross profit" value={formatCurrency(summary.profit.grossProfit)} tone="success" hint={formatPercent(summary.profit.grossMarginPercent)} />
        <StatCard label="Net profit" value={formatCurrency(summary.profit.netProfit)} tone={summary.profit.netProfit >= 0 ? 'success' : 'danger'} hint={formatPercent(summary.profit.netMarginPercent)} />
        <StatCard label="Average ticket" value={formatCurrency(summary.orders.averageTicket)} hint={`${formatNumber(summary.orders.itemsSold)} items sold`} />
      </div>

      {/* Profit & loss statement */}
      <Card>
        <CardHeader title="Profit & loss" description={PRESETS.find((p) => p.value === preset)?.label} />
        <div className="divide-y divide-border">
          <PlRow label="Gross sales" value={summary.revenue.grossSales} />
          <PlRow label="Discounts given" value={-summary.revenue.discounts} muted />
          {summary.revenue.serviceCharge > 0 && <PlRow label="Service charge" value={summary.revenue.serviceCharge} muted />}
          <PlRow label="Net revenue" value={summary.revenue.netRevenue} bold />
          <PlRow label="Cost of goods sold" value={-summary.costs.cogs} muted />
          <PlRow label="Gross profit" value={summary.profit.grossProfit} bold tone="success" />
          <PlRow label="Operating expenses" value={-summary.costs.operatingExpenses} muted />
          <PlRow label="Payment processing fees" value={-summary.costs.paymentFees} muted />
          <PlRow label="Net profit" value={summary.profit.netProfit} bold tone={summary.profit.netProfit >= 0 ? 'success' : 'danger'} />
          <div className="flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground">
            <span>Tax collected (remitted, not income)</span>
            <span className="tabular">{formatCurrency(summary.revenue.tax)}</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue vs profit" description="Daily trend" />
          <div className="h-[300px] p-3 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={formatCompact} width={52} />
                <Tooltip {...tooltipStyle} formatter={(value: number) => formatCurrency(value)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#8B5E3C" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#7BA05B" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Payment mix" />
          {summary.paymentBreakdown.length === 0 ? (
            <EmptyState title="No payments in this period" />
          ) : (
            <div className="h-[300px] p-3 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={summary.paymentBreakdown} dataKey="amount" nameKey="method" innerRadius="50%" outerRadius="80%" paddingAngle={2} strokeWidth={0}>
                    {summary.paymentBreakdown.map((entry, index) => (
                      <Cell key={entry.method} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(value: number) => formatCurrency(value)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Best sellers" description="By revenue" />
          <div className="h-[320px] p-3 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(productsQuery.data ?? []).slice(0, 8)} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={formatCompact} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={110} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill="#8B5E3C" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Category performance" />
          {!categoriesQuery.data?.length ? (
            <EmptyState title="No category data" />
          ) : (
            <ul className="divide-y divide-border">
              {categoriesQuery.data.map((row) => {
                const share = summary.revenue.grossSales > 0 ? (row.revenue / summary.revenue.grossSales) * 100 : 0;
                return (
                  <li key={row.categoryId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
                        <span className="truncate text-sm font-medium">{row.name}</span>
                      </div>
                      <span className="tabular shrink-0 text-sm font-semibold">{formatCurrency(row.revenue)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: row.color }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                        {formatNumber(row.quantity)} pcs
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Cashier performance" description="Revenue attributed to each employee" />
          {!cashiersQuery.data?.length ? (
            <EmptyState title="No sales attributed yet" />
          ) : (
            <ul className="divide-y divide-border">
              {cashiersQuery.data.map((row) => (
                <li key={row.cashier.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.cashier.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.cashier.employeeCode} · {formatNumber(row.orders)} orders · avg {formatCurrency(row.averageTicket)}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-sm font-semibold">{formatCurrency(row.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Expense breakdown" />
          {!expensesQuery.data?.length ? (
            <EmptyState title="No expenses in this period" />
          ) : (
            <ul className="divide-y divide-border">
              {expensesQuery.data.map((row) => (
                <li key={row.categoryId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.count} entr{row.count === 1 ? 'y' : 'ies'} · {row.isFixed ? 'fixed cost' : 'variable cost'}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-sm font-semibold text-destructive">
                    {formatCurrency(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function PlRow({
  label,
  value,
  bold,
  muted,
  tone,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className={cn('flex items-center justify-between px-4 py-2.5', bold && 'bg-muted/40')}>
      <span className={cn('text-sm', bold ? 'font-semibold' : muted ? 'pl-3 text-muted-foreground' : '')}>{label}</span>
      <span
        className={cn(
          'tabular text-sm',
          bold ? 'font-bold' : 'font-medium',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-destructive',
          !tone && value < 0 && 'text-muted-foreground',
        )}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}
