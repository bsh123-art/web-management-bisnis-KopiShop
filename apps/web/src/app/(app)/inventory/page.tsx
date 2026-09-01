'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Boxes, ClipboardCheck, Download, Plus, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { exportToExcel } from '@/lib/export';
import { useRealtime } from '@/lib/use-realtime';
import { cn, formatCurrency, formatNumber, toISODate } from '@/lib/utils';
import type { Ingredient, StockRow, Supplier, UnitType } from '@/lib/types';
import { Badge, Button, Field, Input, Select } from '@/components/ui';
import { Column, DataTable, PageHeader, SearchInput, StatCard } from '@/components/data-table';
import { Modal } from '@/components/modal';

const UNITS: UnitType[] = ['GRAM', 'KILOGRAM', 'MILLILITER', 'LITER', 'PIECE', 'PACK', 'SHOT'];

const MOVEMENT_TYPES = [
  { value: 'ADJUSTMENT', label: 'Manual adjustment' },
  { value: 'WASTAGE', label: 'Wastage / spillage' },
  { value: 'RETURN', label: 'Return to supplier' },
  { value: 'OPENING', label: 'Opening balance' },
] as const;

export default function InventoryPage() {
  useRealtime();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [adjusting, setAdjusting] = useState<StockRow | null>(null);
  const [ingredientOpen, setIngredientOpen] = useState(false);
  const [stocktakeOpen, setStocktakeOpen] = useState(false);

  // Deep link from the dashboard low-stock badge: /inventory?filter=low
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('filter') === 'low') setLowOnly(true);
  }, []);

  const stockQuery = useQuery({
    queryKey: ['stock', { search, lowOnly }],
    queryFn: async () => (await api.get<StockRow[]>('/inventory/stock', { search, lowOnly })).data,
  });

  const rows = stockQuery.data ?? [];
  const totalValue = rows.reduce((acc, row) => acc + row.stockValue, 0);
  const lowCount = rows.filter((row) => row.status === 'LOW').length;
  const outCount = rows.filter((row) => row.status === 'OUT_OF_STOCK').length;

  const columns: Column<StockRow>[] = [
    {
      key: 'name',
      header: 'Ingredient',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.sku}
            {row.supplier && ` · ${row.supplier.name}`}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'On hand',
      align: 'right',
      render: (row) => (
        <span className={cn('font-semibold', row.status === 'OUT_OF_STOCK' && 'text-destructive', row.status === 'LOW' && 'text-warning')}>
          {formatNumber(row.quantity)} <span className="text-xs font-normal text-muted-foreground">{row.unit.toLowerCase()}</span>
        </span>
      ),
    },
    {
      key: 'threshold',
      header: 'Low at',
      align: 'right',
      hideBelow: 'md',
      render: (row) => <span className="text-muted-foreground">{formatNumber(row.lowStockAt)}</span>,
    },
    {
      key: 'cost',
      header: 'Cost / unit',
      align: 'right',
      hideBelow: 'lg',
      render: (row) => formatCurrency(row.costPerUnit),
    },
    { key: 'value', header: 'Stock value', align: 'right', hideBelow: 'sm', render: (row) => formatCurrency(row.stockValue) },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <Badge tone={row.status === 'OUT_OF_STOCK' ? 'danger' : row.status === 'LOW' ? 'warning' : 'success'}>
          {row.status === 'OUT_OF_STOCK' ? 'Out' : row.status === 'LOW' ? 'Low' : 'OK'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button variant="outline" size="sm" onClick={() => setAdjusting(row)}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        description="Ingredient stock levels, deducted automatically on every sale"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToExcel(
                  rows,
                  [
                    { header: 'SKU', value: (r) => r.sku },
                    { header: 'Ingredient', value: (r) => r.name },
                    { header: 'Unit', value: (r) => r.unit },
                    { header: 'On hand', value: (r) => r.quantity },
                    { header: 'Low at', value: (r) => r.lowStockAt },
                    { header: 'Cost/unit', value: (r) => r.costPerUnit },
                    { header: 'Value', value: (r) => r.stockValue },
                    { header: 'Status', value: (r) => r.status },
                  ],
                  `inventory-${toISODate(new Date())}`,
                  'Inventory',
                )
              }
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" onClick={() => setStocktakeOpen(true)}>
              <ClipboardCheck className="h-4 w-4" />
              Stock count
            </Button>
            <Button onClick={() => setIngredientOpen(true)}>
              <Plus className="h-4 w-4" />
              New ingredient
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total stock value" value={formatCurrency(totalValue)} />
        <StatCard label="Tracked ingredients" value={formatNumber(rows.length)} />
        <StatCard label="Low stock" value={formatNumber(lowCount)} tone={lowCount > 0 ? 'warning' : 'default'} />
        <StatCard label="Out of stock" value={formatNumber(outCount)} tone={outCount > 0 ? 'danger' : 'default'} />
      </div>

      {outCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">{outCount} ingredient(s) are out of stock</p>
            <p className="text-muted-foreground">Products that use them cannot be sold until stock is received.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search ingredients…" className="min-w-[220px] flex-1" />
        <Button variant={lowOnly ? 'primary' : 'outline'} onClick={() => setLowOnly((v) => !v)}>
          <AlertTriangle className="h-4 w-4" />
          Low stock only
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={stockQuery.isLoading}
        rowKey={(row) => row.ingredientId}
        emptyIcon={Boxes}
        emptyTitle="No ingredients tracked"
        emptyDescription="Add ingredients so recipes can deduct stock automatically."
      />

      {adjusting && (
        <AdjustModal
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={() => {
            setAdjusting(null);
            void queryClient.invalidateQueries({ queryKey: ['stock'] });
          }}
        />
      )}

      <IngredientModal
        open={ingredientOpen}
        onClose={() => setIngredientOpen(false)}
        onDone={() => {
          setIngredientOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['stock'] });
          void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
        }}
      />

      <StocktakeModal
        open={stocktakeOpen}
        rows={rows}
        onClose={() => setStocktakeOpen(false)}
        onDone={() => {
          setStocktakeOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['stock'] });
        }}
      />
    </div>
  );
}

function AdjustModal({ row, onClose, onDone }: { row: StockRow; onClose: () => void; onDone: () => void }) {
  const [quantity, setQuantity] = useState('');
  const [type, setType] = useState<string>('ADJUSTMENT');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/inventory/stock/adjust', {
        ingredientId: row.ingredientId,
        quantity: Number(quantity),
        type,
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('Stock adjusted');
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const delta = Number(quantity) || 0;
  const projected = row.quantity + delta;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust ${row.name}`}
      description={`Currently ${formatNumber(row.quantity)} ${row.unit.toLowerCase()} on hand`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={delta === 0}>
            Apply adjustment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason" required>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {MOVEMENT_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Quantity change" hint="Use a negative number to remove stock" required>
          <Input
            type="number"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 500 or -250"
            className="tabular text-lg"
            autoFocus
          />
        </Field>

        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="Optional explanation" />
        </Field>

        {delta !== 0 && (
          <div className="rounded-md bg-muted/60 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">New balance</span>
              <span className={cn('tabular font-semibold', projected < 0 && 'text-destructive')}>
                {formatNumber(projected)} {row.unit.toLowerCase()}
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function IngredientModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    sku: '',
    name: '',
    unit: 'GRAM' as UnitType,
    costPerUnit: 0,
    lowStockAt: 0,
    reorderQty: 0,
    supplierId: '',
    openingStock: 0,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get<Supplier[]>('/inventory/suppliers')).data,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => api.post<Ingredient>('/inventory/ingredients', { ...form, supplierId: form.supplierId || null }),
    onSuccess: () => {
      toast.success('Ingredient added');
      setForm({ sku: '', name: '', unit: 'GRAM', costPerUnit: 0, lowStockAt: 0, reorderQty: 0, supplierId: '', openingStock: 0 });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New ingredient"
      description="Raw materials consumed by product recipes"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!form.name || !form.sku}>
            Add ingredient
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} autoFocus />
        </Field>
        <Field label="SKU" required>
          <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} maxLength={40} />
        </Field>
        <Field label="Unit" required>
          <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as UnitType })}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cost per unit" hint="Recalculated automatically on goods receipt">
          <Input type="number" min={0} step="any" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: Number(e.target.value) })} className="tabular" />
        </Field>
        <Field label="Opening stock">
          <Input type="number" min={0} step="any" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value) })} className="tabular" />
        </Field>
        <Field label="Low stock threshold" hint="Triggers an alert at or below this level">
          <Input type="number" min={0} step="any" value={form.lowStockAt} onChange={(e) => setForm({ ...form, lowStockAt: Number(e.target.value) })} className="tabular" />
        </Field>
        <Field label="Reorder quantity" hint="Suggested amount to purchase">
          <Input type="number" min={0} step="any" value={form.reorderQty} onChange={(e) => setForm({ ...form, reorderQty: Number(e.target.value) })} className="tabular" />
        </Field>
        <Field label="Supplier" className="sm:col-span-2">
          <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">No preferred supplier</option>
            {suppliersQuery.data?.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function StocktakeModal({
  open,
  rows,
  onClose,
  onDone,
}: {
  open: boolean;
  rows: StockRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const entries = Object.entries(counts)
    .filter(([, value]) => value !== '')
    .map(([ingredientId, value]) => ({ ingredientId, countedQty: Number(value) }));

  const mutation = useMutation({
    mutationFn: () => api.post('/inventory/stock/stocktake', { counts: entries, note: note || undefined }),
    onSuccess: () => {
      toast.success(`Stock count applied to ${entries.length} item(s)`);
      setCounts({});
      setNote('');
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Physical stock count"
      description="Enter the counted quantity — the system records the variance"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={entries.length === 0}>
            Apply {entries.length > 0 ? `(${entries.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. End of month count" maxLength={255} />
        </Field>

        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {rows.map((row) => {
            const counted = counts[row.ingredientId];
            const variance = counted === '' || counted === undefined ? null : Number(counted) - row.quantity;
            return (
              <li key={row.ingredientId} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    System: {formatNumber(row.quantity)} {row.unit.toLowerCase()}
                  </p>
                </div>
                {variance !== null && variance !== 0 && (
                  <Badge tone={variance > 0 ? 'success' : 'danger'}>
                    {variance > 0 ? '+' : ''}
                    {formatNumber(variance)}
                  </Badge>
                )}
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={counted ?? ''}
                  onChange={(e) => setCounts({ ...counts, [row.ingredientId]: e.target.value })}
                  placeholder="Counted"
                  className="tabular h-9 w-28"
                  aria-label={`Counted quantity for ${row.name}`}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
