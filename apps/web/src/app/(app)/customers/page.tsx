'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Gift, Pencil, Plus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { exportToExcel } from '@/lib/export';
import { formatCurrency, formatDate, formatNumber, toISODate } from '@/lib/utils';
import type { Customer, PageMeta } from '@/lib/types';
import { Badge, Button, Field, Input, Textarea } from '@/components/ui';
import { Column, DataTable, PageHeader, SearchInput, StatCard } from '@/components/data-table';
import { Modal } from '@/components/modal';

interface CustomerDraft {
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  note: string;
}

const emptyDraft: CustomerDraft = { name: '', phone: '', email: '', birthDate: '', note: '' };

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id?: string; draft: CustomerDraft } | null>(null);
  const [redeeming, setRedeeming] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { search, page }],
    queryFn: async () => {
      const response = await api.get<Customer[]>('/customers', { search, page, pageSize: 25, sortBy: 'totalSpent', sortOrder: 'desc' });
      return { items: response.data, meta: response.meta as PageMeta };
    },
  });

  const save = useMutation({
    mutationFn: ({ id, draft }: { id?: string; draft: CustomerDraft }) => {
      const payload = {
        name: draft.name,
        phone: draft.phone || null,
        email: draft.email || null,
        birthDate: draft.birthDate || null,
        note: draft.note || null,
      };
      return id ? api.patch(`/customers/${id}`, payload) : api.post('/customers', payload);
    },
    onSuccess: () => {
      toast.success(editing?.id ? 'Customer updated' : 'Customer added');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const customers = data?.items ?? [];
  const totalSpent = customers.reduce((acc, c) => acc + c.totalSpent, 0);
  const totalPoints = customers.reduce((acc, c) => acc + c.loyaltyPoints, 0);

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.code}
            {row.phone && ` · ${row.phone}`}
          </p>
        </div>
      ),
    },
    { key: 'visits', header: 'Visits', align: 'right', hideBelow: 'sm', render: (row) => formatNumber(row.visitCount) },
    { key: 'spent', header: 'Total spent', align: 'right', render: (row) => formatCurrency(row.totalSpent) },
    {
      key: 'avg',
      header: 'Avg ticket',
      align: 'right',
      hideBelow: 'md',
      render: (row) => formatCurrency(row.visitCount > 0 ? row.totalSpent / row.visitCount : 0),
    },
    {
      key: 'points',
      header: 'Points',
      align: 'center',
      render: (row) => <Badge tone={row.loyaltyPoints > 0 ? 'primary' : 'neutral'}>{formatNumber(row.loyaltyPoints)}</Badge>,
    },
    {
      key: 'last',
      header: 'Last visit',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{formatDate(row.lastVisitAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Redeem points for ${row.name}`}
            disabled={row.loyaltyPoints <= 0}
            onClick={() => setRedeeming(row)}
          >
            <Gift className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Edit ${row.name}`}
            onClick={() =>
              setEditing({
                id: row.id,
                draft: {
                  name: row.name,
                  phone: row.phone ?? '',
                  email: row.email ?? '',
                  birthDate: row.birthDate ? row.birthDate.slice(0, 10) : '',
                  note: row.note ?? '',
                },
              })
            }
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description="Loyalty members, visit history and spend"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToExcel(
                  customers,
                  [
                    { header: 'Code', value: (c) => c.code },
                    { header: 'Name', value: (c) => c.name },
                    { header: 'Phone', value: (c) => c.phone ?? '' },
                    { header: 'Email', value: (c) => c.email ?? '' },
                    { header: 'Visits', value: (c) => c.visitCount },
                    { header: 'Total spent', value: (c) => c.totalSpent },
                    { header: 'Points', value: (c) => c.loyaltyPoints },
                    { header: 'Last visit', value: (c) => (c.lastVisitAt ? formatDate(c.lastVisitAt) : '') },
                  ],
                  `customers-${toISODate(new Date())}`,
                  'Customers',
                )
              }
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => setEditing({ draft: emptyDraft })}>
              <Plus className="h-4 w-4" />
              New customer
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Customers on this page" value={formatNumber(customers.length)} hint={`${data?.meta?.total ?? 0} in total`} />
        <StatCard label="Lifetime spend" value={formatCurrency(totalSpent)} />
        <StatCard label="Points outstanding" value={formatNumber(totalPoints)} />
      </div>

      <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name, phone or email…" />

      <DataTable
        columns={columns}
        rows={customers}
        loading={isLoading}
        rowKey={(row) => row.id}
        meta={data?.meta}
        onPageChange={setPage}
        emptyIcon={Users}
        emptyTitle="No customers yet"
        emptyDescription="Add customers to track loyalty points and spending habits."
      />

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'Edit customer' : 'New customer'}
          footer={
            <>
              <Button variant="outline" onClick={() => setEditing(null)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button onClick={() => save.mutate(editing)} loading={save.isPending} disabled={!editing.draft.name.trim()}>
                {editing.id ? 'Save changes' : 'Add customer'}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required className="sm:col-span-2">
              <Input
                value={editing.draft.name}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })}
                maxLength={120}
                autoFocus
              />
            </Field>
            <Field label="Phone">
              <Input
                type="tel"
                value={editing.draft.phone}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, phone: e.target.value } })}
                maxLength={32}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={editing.draft.email}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, email: e.target.value } })}
                maxLength={120}
              />
            </Field>
            <Field label="Birthday" hint="Used for birthday promotions" className="sm:col-span-2">
              <Input
                type="date"
                value={editing.draft.birthDate}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, birthDate: e.target.value } })}
              />
            </Field>
            <Field label="Note" className="sm:col-span-2">
              <Textarea
                value={editing.draft.note}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, note: e.target.value } })}
                maxLength={500}
                rows={2}
                placeholder="Preferences, allergies, anything worth remembering"
              />
            </Field>
          </div>
        </Modal>
      )}

      {redeeming && <RedeemModal customer={redeeming} onClose={() => setRedeeming(null)} />}
    </div>
  );
}

function RedeemModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [points, setPoints] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`/customers/${customer.id}/redeem`, { points: Number(points) }),
    onSuccess: () => {
      toast.success('Points redeemed');
      onClose();
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const value = Number(points) || 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Redeem loyalty points"
      description={`${customer.name} has ${formatNumber(customer.loyaltyPoints)} points`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={value <= 0 || value > customer.loyaltyPoints}
          >
            Redeem {value > 0 ? formatNumber(value) : ''} points
          </Button>
        </>
      }
    >
      <Field label="Points to redeem" required>
        <Input
          type="number"
          min={1}
          max={customer.loyaltyPoints}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          className="tabular text-lg"
          autoFocus
        />
      </Field>
    </Modal>
  );
}
