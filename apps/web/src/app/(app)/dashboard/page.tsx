'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Coffee,
  DollarSign,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/use-realtime';
import { cn, formatCompact, formatCurrency, formatNumber, formatPercent, formatRelative } from '@/lib/utils';
import type { DashboardData } from '@/lib/types';
import { Badge, Card, CardHeader, EmptyState, Spinner } from '@/components/ui';

const CHART_COLORS = ['#8B5E3C', '#C08552', '#7BA05B', '#D4A574', '#5C4033', '#A9746E'];

function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="tabular mt-1.5 truncate text-2xl font-bold">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {delta !== undefined && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium">
          {positive ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-success" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className={positive ? 'text-success' : 'text-destructive'}>{formatPercent(Math.abs(delta))}</span>
          <span className="text-muted-foreground">vs yesterday</span>
        </div>
      )}
    </Card>
  );
}

const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    color: 'hsl(var(--card-foreground))',
    fontSize: 12,
  },
  labelStyle: { color: 'hsl(var(--muted-foreground))', fontSize: 11 },
};

export default function DashboardPage() {
  useRealtime();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/reports/dashboard')).data,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="Could not load the dashboard"
          description="Check that the API is running and try refreshing the page."
        />
      </Card>
    );
  }

  const trend = data.salesTrend.map((point) => ({
    date: new Date(point.bucket).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
    revenue: point.revenue,
    profit: point.profit,
    orders: point.orders,
  }));

  const hourly = data.hourlyDistribution
    .filter((h) => h.hour >= 6 && h.hour <= 23)
    .map((h) => ({ hour: `${String(h.hour).padStart(2, '0')}:00`, orders: h.orders, revenue: h.revenue }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live overview · updated {formatRelative(data.generatedAt)}
          </p>
        </div>
        {data.lowStockCount > 0 && (
          <Link href="/inventory?filter=low">
            <Badge tone="warning" className="px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {data.lowStockCount} ingredient{data.lowStockCount === 1 ? '' : 's'} low on stock
            </Badge>
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue today"
          value={formatCurrency(data.today.revenue.netRevenue)}
          delta={data.comparison.revenueGrowth}
          icon={DollarSign}
        />
        <KpiCard
          label="Orders today"
          value={formatNumber(data.today.orders.count)}
          delta={data.comparison.orderGrowth}
          icon={Receipt}
          hint={`${formatNumber(data.today.orders.itemsSold)} items sold`}
        />
        <KpiCard
          label="Net profit today"
          value={formatCurrency(data.today.profit.netProfit)}
          delta={data.comparison.profitGrowth}
          icon={TrendingUp}
          hint={`${formatPercent(data.today.profit.netMarginPercent)} margin`}
        />
        <KpiCard
          label="Average ticket"
          value={formatCurrency(data.today.orders.averageTicket)}
          icon={Coffee}
          hint={`${formatCurrency(data.month.revenue.netRevenue)} this month`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue & profit" description="Last 30 days" />
          <div className="h-[300px] p-3 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5E3C" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8B5E3C" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7BA05B" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#7BA05B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={formatCompact} width={52} />
                <Tooltip {...tooltipStyle} formatter={(value: number, name) => [formatCurrency(value), name === 'revenue' ? 'Revenue' : 'Profit']} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => (value === 'revenue' ? 'Revenue' : 'Profit')} />
                <Area type="monotone" dataKey="revenue" stroke="#8B5E3C" strokeWidth={2} fill="url(#revenueFill)" />
                <Area type="monotone" dataKey="profit" stroke="#7BA05B" strokeWidth={2} fill="url(#profitFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sales by category" description="This month" />
          {data.categoryBreakdown.length === 0 ? (
            <EmptyState title="No sales yet this month" />
          ) : (
            <div className="h-[300px] p-3 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categoryBreakdown}
                    dataKey="revenue"
                    nameKey="name"
                    innerRadius="52%"
                    outerRadius="80%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {data.categoryBreakdown.map((entry, index) => (
                      <Cell key={entry.categoryId} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(value: number) => formatCurrency(value)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Busiest hours" description="Orders today" />
          <div className="h-[240px] p-3 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} interval={2} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(value: number, name) => [name === 'orders' ? value : formatCurrency(value), name === 'orders' ? 'Orders' : 'Revenue']} />
                <Bar dataKey="orders" fill="#C08552" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Top products" description="This month" />
          {data.topProducts.length === 0 ? (
            <EmptyState title="No product sales yet" />
          ) : (
            <ul className="divide-y divide-border">
              {data.topProducts.map((product, index) => (
                <li key={product.productId} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(product.quantitySold)} sold</p>
                  </div>
                  <span className="tabular shrink-0 text-sm font-semibold">{formatCurrency(product.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            action={
              <Link href="/transactions" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            }
          />
          {data.recentOrders.length === 0 ? (
            <EmptyState icon={Receipt} title="No orders yet today" description="Completed sales will appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {data.recentOrders.map((order) => (
                <li key={order.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{order.orderNumber}</p>
                      {order.status !== 'COMPLETED' && (
                        <Badge tone={order.status === 'VOIDED' ? 'danger' : 'warning'}>{order.status.toLowerCase()}</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {order._count.items} item{order._count.items === 1 ? '' : 's'} · {order.cashier.fullName} ·{' '}
                      {formatRelative(order.createdAt)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'tabular shrink-0 text-sm font-semibold',
                      order.status !== 'COMPLETED' && 'text-muted-foreground line-through',
                    )}
                  >
                    {formatCurrency(order.total)}
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
