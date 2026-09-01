'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PackageCheck, Plus, Send, Sparkles, Trash2, Truck, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import type { Ingredient, PageMeta, PurchaseOrder, PurchaseOrderStatus, Supplier, UnitType } from '@/lib/types';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { Column, DataTable, PageHeader, SearchInput, StatCard } from '@/components/data-table';
import { ConfirmDialog, Modal } from '@/components/modal';

const STATUS_TONES: Record<PurchaseOrderStatus, 'neutral' | 'primary' | 'warning' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  ORDERED: 'primary',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  CANCELLED: 'danger',
};

interface LineDraft {
  ingredientId: string;
  quantity: number;
  unitCost: number;
}

interface Suggestion {
  ingredientId: string;
  name: string;
  unit: UnitType;
  onHand: number;
  suggestedQty: number;
  unitCost: number;
  supplier: { id: string; name: string } | null;
}

export default function PurchaseOrdersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [cancelling, setCancelling] = useState<PurchaseOrder | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', { search, status, page }],
    queryFn: async () => {
      const response = await api.get<PurchaseOrder[]>('/purchase-orders', { search, status, page, pageSize: 20 });
      return { items: response.data, meta: response.meta as PageMeta };
    },
  });

  const suggestionsQuery = useQuery({
    queryKey: ['reorder-suggestions'],
    queryFn: async () => (await api.get<Suggestion[]>('/purchase-orders/reorder-suggestions')).data,
  });

  const submit = useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/submit`),
    onSuccess: () => {
      toast.success('Purchase order sent');
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/cancel`, { reason: 'Cancelled by manager' }),
    onSuccess: () => {
      toast.success('Purchase order cancelled');
      setCancelling(null);
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const orders = data?.items ?? [];
  const outstanding = orders.filter((po) => po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED');
  const outstandingValue = outstanding.reduce((acc, po) => acc + po.total, 0);

  const columns: Column<PurchaseOrder>[] = [
    {
      key: 'po',
      header: 'Purchase order',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.poNumber}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.supplier.name} · {row.items.length} line{row.items.length === 1 ? '' : 's'}
          </p>
        </div>
      ),
    },
    { key: 'created', header: 'Created', hideBelow: 'md', render: (row) => formatDate(row.createdAt) },
    {
      key: 'expected',
      header: 'Expected',
      hideBelow: 'lg',
      render: (row) => <span className="text-muted-foreground">{formatDate(row.expectedAt)}</span>,
    },
    { key: 'total', header: 'Total', align: 'right', render: (row) => <span className="font-semibold">{formatCurrency(row.total)}</span> },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => <Badge tone={STATUS_TONES[row.status]}>{row.status.replace('_', ' ').toLowerCase()}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          {row.status === 'DRAFT' && (
            <Button variant="outline" size="sm" onClick={() => submit.mutate(row.id)} loading={submit.isPending}>
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          )}
          {(row.status === 'ORDERED' || row.status === 'PARTIALLY_RECEIVED') && (
            <Button variant="primary" size="sm" onClick={() => setReceiving(row)}>
              <PackageCheck className="h-3.5 w-3.5" />
              Receive
            </Button>
          )}
          {row.status !== 'RECEIVED' && row.status !== 'CANCELLED' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label="Cancel purchase order"
              onClick={() => setCancelling(row)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        description="Restock ingredients and record goods receipts"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New purchase order
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Open orders" value={formatNumber(outstanding.length)} />
        <StatCard label="Value outstanding" value={formatCurrency(outstandingValue)} />
        <StatCard
          label="Reorder suggestions"
          value={formatNumber(suggestionsQuery.data?.length ?? 0)}
          tone={(suggestionsQuery.data?.length ?? 0) > 0 ? 'warning' : 'default'}
        />
      </div>

      {(suggestionsQuery.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <Sparkles className="h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {suggestionsQuery.data?.length} ingredient(s) are at or below their reorder point
            </p>
            <p className="truncate text-muted-foreground">
              {suggestionsQuery.data?.slice(0, 4).map((s) => s.name).join(', ')}
              {(suggestionsQuery.data?.length ?? 0) > 4 && '…'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            Create order
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search PO number or supplier…" className="min-w-[220px] flex-1" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-auto min-w-[170px]" aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.keys(STATUS_TONES).map((option) => (
            <option key={option} value={option}>
              {option.replace('_', ' ').toLowerCase()}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        loading={isLoading}
        rowKey={(row) => row.id}
        meta={data?.meta}
        onPageChange={setPage}
        emptyIcon={Truck}
        emptyTitle="No purchase orders"
        emptyDescription="Create one to restock ingredients from a supplier."
      />

      {creating && (
        <CreateOrderModal
          suggestions={suggestionsQuery.data ?? []}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
          }}
        />
      )}

      {receiving && (
        <ReceiveModal
          order={receiving}
          onClose={() => setReceiving(null)}
          onDone={() => {
            setReceiving(null);
            void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            void queryClient.invalidateQueries({ queryKey: ['stock'] });
          }}
        />
      )}

      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
        title="Cancel purchase order"
        message={`${cancelling?.poNumber} will be marked as cancelled. Items already received stay in stock.`}
        confirmLabel="Cancel order"
        destructive
        loading={cancel.isPending}
      />
    </div>
  );
}

function CreateOrderModal({
  suggestions,
  onClose,
  onDone,
}: {
  suggestions: Suggestion[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [shippingFee, setShippingFee] = useState(0);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get<Supplier[]>('/inventory/suppliers')).data,
  });

  const ingredientsQuery = useQuery({
    queryKey: ['ingredients', 'all'],
    queryFn: async () => (await api.get<Ingredient[]>('/inventory/ingredients', { pageSize: 200 })).data,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/purchase-orders', {
        supplierId,
        expectedAt: expectedAt || null,
        shippingFee,
        note: note || null,
        items: lines.filter((line) => line.ingredientId && line.quantity > 0),
      }),
    onSuccess: () => {
      toast.success('Purchase order created as a draft');
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const applySuggestions = () => {
    setLines(
      suggestions.map((s) => ({ ingredientId: s.ingredientId, quantity: s.suggestedQty, unitCost: s.unitCost })),
    );
    const preferred = suggestions.find((s) => s.supplier)?.supplier?.id;
    if (preferred && !supplierId) setSupplierId(preferred);
  };

  const subtotal = lines.reduce((acc, line) => acc + line.quantity * line.unitCost, 0);

  return (
    <Modal
      open
      onClose={onClose}
      title="New purchase order"
      description="Saved as a draft — send it when you are ready to order"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!supplierId || lines.filter((l) => l.ingredientId && l.quantity > 0).length === 0}
          >
            Create draft
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select a supplier</option>
              {suppliersQuery.data?.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Expected delivery">
            <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
          </Field>
          <Field label="Shipping fee">
            <Input type="number" min={0} value={shippingFee || ''} onChange={(e) => setShippingFee(Number(e.target.value))} className="tabular" />
          </Field>
        </div>

        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Items</h4>
          <div className="flex gap-2">
            {suggestions.length > 0 && (
              <Button variant="outline" size="sm" onClick={applySuggestions}>
                <Sparkles className="h-3.5 w-3.5" />
                Use suggestions ({suggestions.length})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, { ingredientId: '', quantity: 0, unitCost: 0 }])}>
              <Plus className="h-3.5 w-3.5" />
              Add line
            </Button>
          </div>
        </div>

        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            No items added yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line, index) => {
              const ingredient = ingredientsQuery.data?.find((i) => i.id === line.ingredientId);
              return (
                <li key={index} className="flex items-center gap-2">
                  <Select
                    value={line.ingredientId}
                    onChange={(e) => {
                      const selected = ingredientsQuery.data?.find((i) => i.id === e.target.value);
                      const next = [...lines];
                      next[index] = { ...line, ingredientId: e.target.value, unitCost: line.unitCost || (selected?.costPerUnit ?? 0) };
                      setLines(next);
                    }}
                    className="h-10 flex-1"
                    aria-label="Ingredient"
                  >
                    <option value="">Select ingredient</option>
                    {ingredientsQuery.data?.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity || ''}
                    onChange={(e) => {
                      const next = [...lines];
                      next[index] = { ...line, quantity: Number(e.target.value) };
                      setLines(next);
                    }}
                    className="tabular h-10 w-24"
                    aria-label="Quantity"
                    placeholder="Qty"
                  />
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">{ingredient?.unit.toLowerCase() ?? ''}</span>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={line.unitCost || ''}
                    onChange={(e) => {
                      const next = [...lines];
                      next[index] = { ...line, unitCost: Number(e.target.value) };
                      setLines(next);
                    }}
                    className="tabular h-10 w-28"
                    aria-label="Unit cost"
                    placeholder="Cost"
                  />
                  <span className="tabular w-28 shrink-0 text-right text-sm font-medium">
                    {formatCurrency(line.quantity * line.unitCost)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove line"
                    onClick={() => setLines(lines.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
        </Field>

        <div className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular font-medium">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            <span className="tabular font-medium">{formatCurrency(shippingFee)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
            <span>Total</span>
            <span className="tabular">{formatCurrency(subtotal + shippingFee)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ReceiveModal({ order, onClose, onDone }: { order: PurchaseOrder; onClose: () => void; onDone: () => void }) {
  const [receipts, setReceipts] = useState<Record<string, { qty: string; cost: string }>>(() =>
    Object.fromEntries(
      order.items.map((item) => [
        item.id,
        { qty: String(item.quantity - item.receivedQty), cost: String(item.unitCost) },
      ]),
    ),
  );
  const [note, setNote] = useState('');

  const payload = order.items
    .map((item) => ({
      itemId: item.id,
      receivedQty: Number(receipts[item.id]?.qty ?? 0),
      actualUnitCost: Number(receipts[item.id]?.cost ?? item.unitCost),
    }))
    .filter((entry) => entry.receivedQty > 0);

  const mutation = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${order.id}/receive`, { receipts: payload, note: note || undefined }),
    onSuccess: () => {
      toast.success('Goods received — stock and ingredient costs updated');
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Receive ${order.poNumber}`}
      description="Enter what actually arrived — costs roll into a weighted average"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={payload.length === 0}>
            Receive {payload.length} item{payload.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {order.items.map((item) => {
            const outstanding = item.quantity - item.receivedQty;
            return (
              <li key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.ingredient.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Ordered {formatNumber(item.quantity)} · received {formatNumber(item.receivedQty)} · outstanding{' '}
                      <strong>{formatNumber(outstanding)}</strong> {item.ingredient.unit.toLowerCase()}
                    </p>
                  </div>
                  {outstanding <= 0 && <Badge tone="success">Complete</Badge>}
                </div>

                {outstanding > 0 && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={outstanding}
                      step="any"
                      value={receipts[item.id]?.qty ?? ''}
                      onChange={(e) => setReceipts({ ...receipts, [item.id]: { ...receipts[item.id]!, qty: e.target.value } })}
                      className="tabular h-9 flex-1"
                      aria-label={`Quantity received for ${item.ingredient.name}`}
                      placeholder="Quantity received"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={receipts[item.id]?.cost ?? ''}
                      onChange={(e) => setReceipts({ ...receipts, [item.id]: { ...receipts[item.id]!, cost: e.target.value } })}
                      className="tabular h-9 w-32"
                      aria-label={`Actual unit cost for ${item.ingredient.name}`}
                      placeholder="Unit cost"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <Field label="Delivery note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="e.g. Invoice #4471, 2 boxes damaged" />
        </Field>
      </div>
    </Modal>
  );
}
