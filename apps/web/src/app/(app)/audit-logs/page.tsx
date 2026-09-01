'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatRelative, toISODate } from '@/lib/utils';
import type { AuditLogEntry, PageMeta } from '@/lib/types';
import { Badge, Button, Input, Select } from '@/components/ui';
import { Column, DataTable, PageHeader, SearchInput } from '@/components/data-table';
import { Modal } from '@/components/modal';

const ENTITIES = [
  'Order',
  'Product',
  'Category',
  'Ingredient',
  'InventoryStock',
  'PurchaseOrder',
  'Expense',
  'Customer',
  'User',
  'Setting',
  'Branch',
  'Backup',
];

const ACTION_TONES: { match: RegExp; tone: 'success' | 'warning' | 'danger' | 'primary' | 'neutral' }[] = [
  { match: /create|open/i, tone: 'success' },
  { match: /update|receive|submit|close/i, tone: 'primary' },
  { match: /void|refund|delete|cancel|deactivate|archive/i, tone: 'danger' },
  { match: /login|password|pin|reset/i, tone: 'warning' },
];

const toneFor = (action: string) => ACTION_TONES.find((entry) => entry.match.test(action))?.tone ?? 'neutral';

export default function AuditLogsPage() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState(toISODate(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(toISODate(new Date()));
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', { action, entity, from, to, page }],
    queryFn: async () => {
      const response = await api.get<AuditLogEntry[]>('/platform/audit-logs', {
        action,
        entity,
        from: from ? `${from}T00:00:00` : undefined,
        to: to ? `${to}T23:59:59` : undefined,
        page,
        pageSize: 30,
      });
      return { items: response.data, meta: response.meta as PageMeta };
    },
  });

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <div className="min-w-0">
          <Badge tone={toneFor(row.action)}>{row.action.replace(/[._]/g, ' ')}</Badge>
          <p className="mt-1 truncate text-xs text-muted-foreground">{row.entity}</p>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'Performed by',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.user?.fullName ?? 'System'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.user ? `${row.user.employeeCode} · ${row.user.role.toLowerCase()}` : 'Automated'}
          </p>
        </div>
      ),
    },
    {
      key: 'entityId',
      header: 'Record',
      hideBelow: 'lg',
      render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.entityId?.slice(0, 8) ?? '—'}</span>,
    },
    {
      key: 'ip',
      header: 'IP address',
      hideBelow: 'lg',
      render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.ipAddress ?? '—'}</span>,
    },
    {
      key: 'when',
      header: 'When',
      align: 'right',
      render: (row) => (
        <div>
          <p className="text-sm">{formatRelative(row.createdAt)}</p>
          <p className="text-xs text-muted-foreground">{formatDate(row.createdAt, true)}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="Every change made in the system, with who did it and when" />

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          Entries are append-only and cannot be edited or deleted from the application. Passwords, PINs and tokens are
          redacted before anything is written.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <SearchInput value={action} onChange={(v) => { setAction(v); setPage(1); }} placeholder="Filter by action, e.g. void…" className="min-w-[200px] flex-1" />
        <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="w-auto min-w-[150px]" aria-label="Filter by record type">
          <option value="">All record types</option>
          {ENTITIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-auto" aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-auto" aria-label="To date" />
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={setDetail}
        meta={data?.meta}
        onPageChange={setPage}
        emptyIcon={FileText}
        emptyTitle="No audit entries in this range"
        emptyDescription="Try widening the date range."
      />

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.action.replace(/[._]/g, ' ') ?? ''}
        description={detail ? `${detail.entity} · ${formatDate(detail.createdAt, true)}` : undefined}
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <Row label="Performed by" value={detail.user ? `${detail.user.fullName} (${detail.user.employeeCode})` : 'System'} />
            <Row label="Record ID" value={detail.entityId ?? '—'} mono />
            <Row label="IP address" value={detail.ipAddress ?? '—'} mono />
            {detail.changes ? (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Payload</p>
                <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
                  {JSON.stringify(detail.changes, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-muted-foreground">No payload was recorded for this action.</p>
            )}
            <Button variant="outline" className="w-full" onClick={() => setDetail(null)}>
              Close
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'font-medium'}>{value}</span>
    </div>
  );
}
