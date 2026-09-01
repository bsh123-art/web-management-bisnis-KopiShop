'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Pencil, Plus, UserCog, UserX, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { hasRole, useAuth } from '@/lib/auth-store';
import { formatCurrency, formatDate, initials } from '@/lib/utils';
import type { Branch, Employee, PageMeta, Role, Shift } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Field, Input, Select, Spinner } from '@/components/ui';
import { Column, DataTable, PageHeader, SearchInput } from '@/components/data-table';
import { ConfirmDialog, Modal } from '@/components/modal';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'CASHIER'];

const ROLE_TONES: Record<Role, 'primary' | 'warning' | 'neutral'> = {
  ADMIN: 'primary',
  MANAGER: 'warning',
  CASHIER: 'neutral',
};

interface EmployeeDraft {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: Role;
  branchId: string;
  hourlyRate: number;
  hiredAt: string;
  status: string;
}

const emptyDraft: EmployeeDraft = {
  email: '',
  password: '',
  fullName: '',
  phone: '',
  role: 'CASHIER',
  branchId: '',
  hourlyRate: 0,
  hiredAt: '',
  status: 'ACTIVE',
};

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuth((s) => s.user);
  const isAdmin = hasRole(currentUser, 'ADMIN');

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id?: string; draft: EmployeeDraft } | null>(null);
  const [resetting, setResetting] = useState<Employee | null>(null);
  const [deactivating, setDeactivating] = useState<Employee | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', { search, role, page }],
    queryFn: async () => {
      const response = await api.get<Employee[]>('/employees', { search, role, page, pageSize: 25 });
      return { items: response.data, meta: response.meta as PageMeta };
    },
  });

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: async () => (await api.get<Branch[]>('/platform/branches')).data,
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: ({ id, draft }: { id?: string; draft: EmployeeDraft }) => {
      const base = {
        fullName: draft.fullName,
        phone: draft.phone || null,
        role: draft.role,
        branchId: draft.branchId || null,
        hourlyRate: draft.hourlyRate || null,
        hiredAt: draft.hiredAt || null,
      };
      return id
        ? api.patch(`/employees/${id}`, { ...base, status: draft.status })
        : api.post('/employees', { ...base, email: draft.email, password: draft.password });
    },
    onSuccess: () => {
      toast.success(editing?.id ? 'Employee updated' : 'Employee created');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: () => {
      toast.success('Employee deactivated');
      setDeactivating(null);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {initials(row.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{row.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.employeeCode} · {row.email}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', align: 'center', render: (row) => <Badge tone={ROLE_TONES[row.role]}>{row.role.toLowerCase()}</Badge> },
    {
      key: 'branch',
      header: 'Branch',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{row.branch?.name ?? 'Unassigned'}</span>,
    },
    {
      key: 'rate',
      header: 'Hourly rate',
      align: 'right',
      hideBelow: 'md',
      render: (row) => (row.hourlyRate ? formatCurrency(row.hourlyRate) : '—'),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{formatDate(row.lastLoginAt, true)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <Badge tone={row.status === 'ACTIVE' ? 'success' : row.status === 'SUSPENDED' ? 'warning' : 'danger'}>
          {row.status.toLowerCase()}
        </Badge>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (row: Employee) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Reset password for ${row.fullName}`}
                  onClick={() => setResetting(row)}
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Edit ${row.fullName}`}
                  onClick={() =>
                    setEditing({
                      id: row.id,
                      draft: {
                        email: row.email,
                        password: '',
                        fullName: row.fullName,
                        phone: row.phone ?? '',
                        role: row.role,
                        branchId: row.branchId ?? '',
                        hourlyRate: row.hourlyRate ?? 0,
                        hiredAt: row.hiredAt ? row.hiredAt.slice(0, 10) : '',
                        status: row.status,
                      },
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Deactivate ${row.fullName}`}
                  disabled={row.id === currentUser?.id}
                  onClick={() => setDeactivating(row)}
                >
                  <UserX className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Employees"
        description="Staff accounts, roles and cash drawer shifts"
        actions={
          isAdmin ? (
            <Button onClick={() => setEditing({ draft: { ...emptyDraft, branchId: currentUser?.branchId ?? '' } })}>
              <Plus className="h-4 w-4" />
              New employee
            </Button>
          ) : undefined
        }
      />

      <ShiftPanel />

      <div className="flex flex-wrap gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search employees…" className="min-w-[220px] flex-1" />
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="w-auto min-w-[150px]" aria-label="Filter by role">
          <option value="">All roles</option>
          {ROLES.map((option) => (
            <option key={option} value={option}>
              {option.toLowerCase()}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        rowKey={(row) => row.id}
        meta={data?.meta}
        onPageChange={setPage}
        emptyIcon={UserCog}
        emptyTitle="No employees found"
      />

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'Edit employee' : 'New employee'}
          description={editing.id ? undefined : 'The employee code is generated automatically.'}
          footer={
            <>
              <Button variant="outline" onClick={() => setEditing(null)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => save.mutate(editing)}
                loading={save.isPending}
                disabled={!editing.draft.fullName || (!editing.id && (!editing.draft.email || editing.draft.password.length < 8))}
              >
                {editing.id ? 'Save changes' : 'Create employee'}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required className="sm:col-span-2">
              <Input
                value={editing.draft.fullName}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, fullName: e.target.value } })}
                maxLength={120}
                autoFocus
              />
            </Field>

            {!editing.id && (
              <>
                <Field label="Email" required>
                  <Input
                    type="email"
                    value={editing.draft.email}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, email: e.target.value } })}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Temporary password" required hint="8+ chars with upper, lower and a number">
                  <Input
                    type="password"
                    value={editing.draft.password}
                    onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, password: e.target.value } })}
                    autoComplete="new-password"
                  />
                </Field>
              </>
            )}

            <Field label="Role" required>
              <Select
                value={editing.draft.role}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, role: e.target.value as Role } })}
              >
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Branch">
              <Select
                value={editing.draft.branchId}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, branchId: e.target.value } })}
              >
                <option value="">Unassigned</option>
                {branchesQuery.data?.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Phone">
              <Input
                type="tel"
                value={editing.draft.phone}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, phone: e.target.value } })}
                maxLength={32}
              />
            </Field>

            <Field label="Hourly rate">
              <Input
                type="number"
                min={0}
                value={editing.draft.hourlyRate || ''}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, hourlyRate: Number(e.target.value) } })}
                className="tabular"
              />
            </Field>

            <Field label="Hired on">
              <Input
                type="date"
                value={editing.draft.hiredAt}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, hiredAt: e.target.value } })}
              />
            </Field>

            {editing.id && (
              <Field label="Status">
                <Select
                  value={editing.draft.status}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, status: e.target.value } })}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="TERMINATED">Terminated</option>
                </Select>
              </Field>
            )}
          </div>
        </Modal>
      )}

      {resetting && <ResetPasswordModal employee={resetting} onClose={() => setResetting(null)} />}

      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && deactivate.mutate(deactivating.id)}
        title="Deactivate employee"
        message={`${deactivating?.fullName} will be signed out of all devices and can no longer log in. Their sales history is kept.`}
        confirmLabel="Deactivate"
        destructive
        loading={deactivate.isPending}
      />
    </div>
  );
}

/** Cash drawer control for the signed-in user. */
function ShiftPanel() {
  const queryClient = useQueryClient();
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shift', 'current'],
    queryFn: async () => (await api.get<Shift | null>('/employees/shifts/current')).data,
  });

  const openShift = useMutation({
    mutationFn: () => api.post('/employees/shifts/open', { openingCash: Number(openingCash) || 0 }),
    onSuccess: () => {
      toast.success('Shift opened');
      setOpeningCash('');
      void queryClient.invalidateQueries({ queryKey: ['shift'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const closeShift = useMutation({
    mutationFn: () => api.post<Shift>('/employees/shifts/close', { closingCash: Number(closingCash) || 0 }),
    onSuccess: (response) => {
      const difference = response.data.difference ?? 0;
      toast.success('Shift closed', {
        description:
          difference === 0
            ? 'Cash reconciled exactly.'
            : `${difference > 0 ? 'Over' : 'Short'} by ${formatCurrency(Math.abs(difference))}`,
      });
      setCloseOpen(false);
      setClosingCash('');
      void queryClient.invalidateQueries({ queryKey: ['shift'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <Card className="flex justify-center p-6">
        <Spinner />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="My cash drawer"
        description={shift ? `Opened ${formatDate(shift.openedAt, true)}` : 'No shift is currently open'}
        action={<Wallet className="h-5 w-5 text-muted-foreground" />}
      />
      <div className="flex flex-wrap items-end gap-3 p-4">
        {shift ? (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Opening float</p>
              <p className="tabular text-lg font-bold">{formatCurrency(shift.openingCash)}</p>
            </div>
            <div className="flex-1" />
            <Button variant="destructive" onClick={() => setCloseOpen(true)}>
              Close shift
            </Button>
          </>
        ) : (
          <>
            <Field label="Opening cash float" className="w-48">
              <Input
                type="number"
                min={0}
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="tabular"
                placeholder="0"
              />
            </Field>
            <Button onClick={() => openShift.mutate()} loading={openShift.isPending}>
              Open shift
            </Button>
          </>
        )}
      </div>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Close shift"
        description="Count the drawer and enter the total cash"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseOpen(false)} disabled={closeShift.isPending}>
              Cancel
            </Button>
            <Button onClick={() => closeShift.mutate()} loading={closeShift.isPending}>
              Close shift
            </Button>
          </>
        }
      >
        <Field label="Counted cash" required>
          <Input
            type="number"
            min={0}
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            className="tabular text-lg"
            autoFocus
          />
        </Field>
      </Modal>
    </Card>
  );
}

function ResetPasswordModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`/employees/${employee.id}/reset-password`, { newPassword: password }),
    onSuccess: () => {
      toast.success('Password reset — the employee has been signed out everywhere');
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password"
      description={`Set a new temporary password for ${employee.fullName}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={password.length < 8}>
            Reset password
          </Button>
        </>
      }
    >
      <Field label="New password" required hint="At least 8 characters with upper, lower and a number">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
      </Field>
    </Modal>
  );
}
