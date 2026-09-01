'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Plus, Trash2, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { hasRole, useAuth } from '@/lib/auth-store';
import { exportToExcel } from '@/lib/export';
import { formatCurrency, formatDate, toISODate } from '@/lib/utils';
import type { Expense, ExpenseCategory, PageMeta, PaymentMethod } from '@/lib/types';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { Column, DataTable, PageHeader, SearchInput, StatCard } from '@/components/data-table';
import { ConfirmDialog, Modal } from '@/components/modal';

const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'DEBIT_CARD', 'CREDIT_CARD', 'EWALLET', 'QRIS'];

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const canManage = hasRole(user, 'MANAGER');

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState(toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(toISODate(new Date()));
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', { search, categoryId, from, to, page }],
    queryFn: async () => {
      const response = await api.get<Expense[]>('/expenses', {
        search,
        categoryId,
        from: from ? `${from}T00:00:00` : undefined,
        to: to ? `${to}T23:59:59` : undefined,
        page,
        pageSize: 25,
      });
      return { items: response.data, meta: response.meta as PageMeta & { totalAmount: number } };
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => (await api.get<ExpenseCategory[]>('/expenses/categories')).data,
    staleTime: 5 * 60_000,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      toast.success('Expense deleted');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const expenses = data?.items ?? [];
  const totalAmount = data?.meta?.totalAmount ?? 0;
  const fixedTotal = expenses.filter((e) => e.category.isFixed).reduce((acc, e) => acc + e.amount, 0);

  const columns: Column<Expense>[] = [
    {
      key: 'title',
      header: 'Expense',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.vendor ?? 'No vendor'} · {row.createdBy?.fullName ?? 'System'}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <Badge tone={row.category.isFixed ? 'primary' : 'neutral'}>
          {row.category.name}
          {row.category.isFixed && ' · fixed'}
        </Badge>
      ),
    },
    { key: 'date', header: 'Date', hideBelow: 'sm', render: (row) => formatDate(row.spentAt) },
    {
      key: 'method',
      header: 'Paid via',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.paymentMethod.replace('_', ' ').toLowerCase()}</span>,
    },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="font-semibold">{formatCurrency(row.amount)}</span> },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (row: Expense) => (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${row.title}`}
                onClick={() => setDeleting(row)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        description="Operating costs that feed into net profit"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToExcel(
                  expenses,
                  [
                    { header: 'Date', value: (e) => formatDate(e.spentAt) },
                    { header: 'Title', value: (e) => e.title },
                    { header: 'Category', value: (e) => e.category.name },
                    { header: 'Vendor', value: (e) => e.vendor ?? '' },
                    { header: 'Method', value: (e) => e.paymentMethod },
                    { header: 'Amount', value: (e) => e.amount },
                  ],
                  `expenses-${from}_${to}`,
                  'Expenses',
                )
              }
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Record expense
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total for period" value={formatCurrency(totalAmount)} tone="danger" />
        <StatCard label="Fixed costs (page)" value={formatCurrency(fixedTotal)} />
        <StatCard label="Entries" value={String(data?.meta?.total ?? 0)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search expenses…" className="min-w-[200px] flex-1" />
        <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="w-auto min-w-[160px]" aria-label="Filter by category">
          <option value="">All categories</option>
          {categoriesQuery.data?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-auto" aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-auto" aria-label="To date" />
      </div>

      <DataTable
        columns={columns}
        rows={expenses}
        loading={isLoading}
        rowKey={(row) => row.id}
        meta={data?.meta}
        onPageChange={setPage}
        emptyIcon={Wallet}
        emptyTitle="No expenses recorded"
        emptyDescription="Track rent, utilities and supplies to see true net profit."
      />

      <ExpenseModal
        open={formOpen}
        categories={categoriesQuery.data ?? []}
        onClose={() => setFormOpen(false)}
        onDone={() => {
          setFormOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['expenses'] });
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="Delete expense"
        message={`"${deleting?.title}" will be permanently removed and reports will be recalculated.`}
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
      />
    </div>
  );
}

function ExpenseModal({
  open,
  categories,
  onClose,
  onDone,
}: {
  open: boolean;
  categories: ExpenseCategory[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    categoryId: '',
    title: '',
    amount: 0,
    paymentMethod: 'CASH' as PaymentMethod,
    vendor: '',
    note: '',
    spentAt: toISODate(new Date()),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/expenses', {
        ...form,
        vendor: form.vendor || null,
        note: form.note || null,
        spentAt: `${form.spentAt}T12:00:00`,
      }),
    onSuccess: () => {
      toast.success('Expense recorded');
      setForm({ categoryId: '', title: '', amount: 0, paymentMethod: 'CASH', vendor: '', note: '', spentAt: toISODate(new Date()) });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record expense"
      description="Anything you spend to run the shop"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!form.title.trim() || !form.categoryId || form.amount <= 0}
          >
            Save expense
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Description" required className="sm:col-span-2">
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. December electricity bill"
            maxLength={150}
            autoFocus
          />
        </Field>
        <Field label="Category" required>
          <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" required>
          <Input
            type="number"
            min={0}
            value={form.amount || ''}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            className="tabular"
          />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={form.spentAt} onChange={(e) => setForm({ ...form, spentAt: e.target.value })} />
        </Field>
        <Field label="Paid via">
          <Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}>
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {method.replace('_', ' ').toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor" className="sm:col-span-2">
          <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
