'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Barcode,
  CheckCircle2,
  Coffee,
  Minus,
  Percent,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Star,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { calculateTotals, useCart, type CartLine } from '@/lib/cart-store';
import { enqueueOrder, newIdempotencyKey, cacheCatalog, readCachedCatalog } from '@/lib/offline';
import { printReceipt } from '@/lib/receipt';
import { useRealtime } from '@/lib/use-realtime';
import { cn, formatCurrency } from '@/lib/utils';
import type { AppSettings, Customer, OrderChannel, PosCatalog, PosProduct, Receipt } from '@/lib/types';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { Modal } from '@/components/modal';
import { PaymentModal, type PaymentEntry } from '@/components/pos/payment-modal';

const CHANNELS: { value: OrderChannel; label: string }[] = [
  { value: 'DINE_IN', label: 'Dine in' },
  { value: 'TAKEAWAY', label: 'Takeaway' },
  { value: 'DELIVERY', label: 'Delivery' },
];

export default function PosPage() {
  useRealtime();
  const queryClient = useQueryClient();
  const cart = useCart();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [variantFor, setVariantFor] = useState<PosProduct | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const [offlineCatalog, setOfflineCatalog] = useState<PosCatalog | null>(null);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ['pos-catalog'],
    queryFn: async () => {
      const response = await api.get<PosCatalog>('/catalog/pos');
      void cacheCatalog(response.data);
      return response.data;
    },
    staleTime: 5 * 60_000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<AppSettings>('/platform/settings')).data,
    staleTime: 5 * 60_000,
  });

  // Fall back to the cached catalog so the till keeps working with no network.
  useEffect(() => {
    if (catalog) return;
    void readCachedCatalog().then((cached) => {
      if (cached) {
        setOfflineCatalog(cached.catalog);
        toast.info('Showing the last saved menu — you are working offline.');
      }
    });
  }, [catalog]);

  const activeCatalog = catalog ?? offlineCatalog;

  const totals = useMemo(
    () =>
      calculateTotals(cart.lines, {
        discountType: cart.discountType,
        discountValue: cart.discountValue,
        taxEnabled: settings?.taxEnabled ?? true,
        taxRate: settings?.taxRate ?? 0.11,
        taxInclusive: settings?.taxInclusive ?? false,
        serviceChargeEnabled: settings?.serviceChargeEnabled ?? false,
        serviceChargeRate: settings?.serviceChargeRate ?? 0,
        cashRounding: settings?.cashRounding ?? 0,
      }),
    [cart.lines, cart.discountType, cart.discountValue, settings],
  );

  const products = useMemo(() => {
    const all = activeCatalog?.products ?? [];
    const term = search.trim().toLowerCase();
    return all.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.barcode?.includes(term)
      );
    });
  }, [activeCatalog, search, categoryId]);

  /** Barcode scanners type fast and end with Enter — treat an exact match as a scan. */
  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const term = search.trim();
    if (!term) return;

    const exact = activeCatalog?.products.find((p) => p.barcode === term || p.sku.toLowerCase() === term.toLowerCase());
    const match = exact ?? (products.length === 1 ? products[0] : undefined);

    if (match) {
      selectProduct(match);
      setSearch('');
    } else {
      toast.error(`No product matches "${term}"`);
    }
  };

  const selectProduct = (product: PosProduct) => {
    if (product.variants.length > 1) {
      setVariantFor(product);
      return;
    }
    cart.addItem(product, product.variants[0] ?? null);
  };

  const submitOrder = useMutation({
    mutationFn: async (payments: PaymentEntry[]) => {
      const idempotencyKey = newIdempotencyKey();
      const payload = {
        idempotencyKey,
        customerId: cart.customerId,
        channel: cart.channel,
        tableNumber: cart.tableNumber || null,
        note: cart.orderNote || null,
        discountType: cart.discountType,
        discountValue: cart.discountType ? cart.discountValue : null,
        clientCreatedAt: new Date().toISOString(),
        items: cart.lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          discountAmount: line.discountAmount,
          note: line.note || null,
        })),
        payments: payments.map((p) => ({ method: p.method, amount: p.amount, referenceNo: p.referenceNo ?? null })),
      };

      try {
        const response = await api.post<Receipt['order']>('/orders', payload);
        return { order: response.data, queued: false as const };
      } catch (err) {
        // Offline: bank the sale locally and let the sync worker replay it.
        if (err instanceof ApiError && err.isOffline) {
          await enqueueOrder(payload, idempotencyKey);
          return { order: null, queued: true as const };
        }
        throw err;
      }
    },

    onSuccess: async (result) => {
      setPaymentOpen(false);

      if (result.queued) {
        toast.success('Saved offline', { description: 'This sale will sync automatically once you reconnect.' });
        cart.clear();
        return;
      }

      toast.success(`Order ${result.order.orderNumber} completed`);
      cart.clear();

      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });

      try {
        const receipt = await api.get<Receipt>(`/orders/${result.order.id}/receipt`);
        setLastReceipt(receipt.data);
        printReceipt(receipt.data);
      } catch {
        toast.warning('Order saved, but the receipt could not be loaded for printing.');
      }
    },

    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INSUFFICIENT_STOCK') {
        const shortages = (error.details as { ingredientName: string; shortBy: number }[]) ?? [];
        toast.error('Not enough ingredients', {
          description: shortages.map((s) => `${s.ingredientName}: short by ${s.shortBy}`).join(', '),
          duration: 8000,
        });
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Could not complete the sale');
    },
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'F4' && cart.lines.length > 0) {
        event.preventDefault();
        setPaymentOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cart.lines.length]);

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col gap-4 lg:flex-row">
      {/* Product grid */}
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search or scan a barcode…  (F2)"
              className="pl-9"
              aria-label="Search products or scan barcode"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="icon" aria-label="Barcode mode" onClick={() => searchRef.current?.focus()}>
            <Barcode className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Product categories">
          <button
            type="button"
            role="tab"
            aria-selected={categoryId === null}
            onClick={() => setCategoryId(null)}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              categoryId === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            All
          </button>
          {activeCatalog?.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                categoryId === category.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && !activeCatalog ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="skeleton h-32" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <Card>
              <EmptyState icon={Coffee} title="No products found" description="Try a different search term or category." />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => selectProduct(product)}
                  className="group relative flex h-32 flex-col justify-between overflow-hidden rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-primary hover:shadow-md active:scale-[0.98]"
                >
                  {product.isFavorite && (
                    <Star className="absolute right-2 top-2 h-4 w-4 fill-warning text-warning" aria-label="Favourite" />
                  )}
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">{product.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{product.categoryName}</p>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <span className="tabular text-sm font-bold text-primary">{formatCurrency(product.basePrice)}</span>
                    {product.variants.length > 1 && (
                      <Badge tone="neutral" className="text-[10px]">
                        {product.variants.length} sizes
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Cart */}
      <aside className="flex w-full min-h-0 shrink-0 flex-col rounded-lg border border-border bg-card lg:w-[380px]">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span className="font-semibold">Current order</span>
            {totals.itemCount > 0 && <Badge tone="primary">{totals.itemCount}</Badge>}
          </div>
          {cart.lines.length > 0 && (
            <Button variant="ghost" size="sm" onClick={cart.clear} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex gap-2 border-b border-border p-3">
          <Select
            value={cart.channel}
            onChange={(e) => cart.setChannel(e.target.value as OrderChannel)}
            aria-label="Order type"
            className="h-9 flex-1 text-sm"
          >
            {CHANNELS.map((channel) => (
              <option key={channel.value} value={channel.value}>
                {channel.label}
              </option>
            ))}
          </Select>
          {cart.channel === 'DINE_IN' && (
            <Input
              value={cart.tableNumber}
              onChange={(e) => cart.setTableNumber(e.target.value)}
              placeholder="Table"
              aria-label="Table number"
              className="h-9 w-20 text-sm"
              maxLength={20}
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => setCustomerOpen(true)}
          className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
        >
          <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn('flex-1 truncate', !cart.customerName && 'text-muted-foreground')}>
            {cart.customerName ?? 'Add customer (optional)'}
          </span>
          {cart.customerName && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Remove customer"
              onClick={(e) => {
                e.stopPropagation();
                cart.setCustomer(null, null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && cart.setCustomer(null, null)}
              className="rounded p-1 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.lines.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Cart is empty" description="Tap a product to start the order." />
          ) : (
            <ul className="divide-y divide-border">
              {cart.lines.map((line) => (
                <CartRow key={line.key} line={line} />
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-border p-3">
          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={formatCurrency(totals.subtotal)} />
            {totals.discountTotal > 0 && (
              <Row label="Discount" value={`−${formatCurrency(totals.discountTotal)}`} tone="success" />
            )}
            {totals.serviceAmount > 0 && <Row label="Service" value={formatCurrency(totals.serviceAmount)} />}
            {totals.taxAmount > 0 && (
              <Row label={settings?.taxInclusive ? 'Tax (incl.)' : 'Tax'} value={formatCurrency(totals.taxAmount)} />
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <span className="font-semibold">Total</span>
              <span className="tabular text-xl font-bold text-primary">{formatCurrency(totals.total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setDiscountOpen(true)} disabled={cart.lines.length === 0}>
              <Percent className="h-4 w-4" />
              Discount
            </Button>
            <Button
              variant="outline"
              onClick={() => lastReceipt && printReceipt(lastReceipt)}
              disabled={!lastReceipt}
              title={lastReceipt ? 'Reprint the last receipt' : 'No receipt yet'}
            >
              <Printer className="h-4 w-4" />
              Reprint
            </Button>
          </div>

          <Button
            size="lg"
            variant="success"
            className="w-full text-base"
            disabled={cart.lines.length === 0}
            onClick={() => setPaymentOpen(true)}
          >
            <CheckCircle2 className="h-5 w-5" />
            Charge {formatCurrency(totals.total)}
          </Button>
        </div>
      </aside>

      {/* Variant picker */}
      <Modal
        open={!!variantFor}
        onClose={() => setVariantFor(null)}
        title={variantFor?.name ?? ''}
        description="Choose an option"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {variantFor?.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => {
                cart.addItem(variantFor, variant);
                setVariantFor(null);
              }}
              className="flex touch-target items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-muted"
            >
              <span className="font-medium">{variant.name}</span>
              <span className="tabular text-sm font-semibold text-primary">
                {formatCurrency(variantFor.basePrice + variant.priceDelta)}
              </span>
            </button>
          ))}
        </div>
      </Modal>

      <DiscountModal open={discountOpen} onClose={() => setDiscountOpen(false)} />
      <CustomerPicker open={customerOpen} onClose={() => setCustomerOpen(false)} />

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        total={totals.total}
        enabledMethods={settings?.enabledPaymentMethods ?? ['CASH', 'QRIS']}
        qrisPayload={settings?.qrisStaticPayload}
        submitting={submitOrder.isPending}
        onConfirm={(payments) => submitOrder.mutate(payments)}
      />
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular font-medium', tone === 'success' && 'text-success')}>{value}</span>
    </div>
  );
}

function CartRow({ line }: { line: CartLine }) {
  const cart = useCart();
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{line.name}</p>
          {line.variantName && <p className="text-xs text-muted-foreground">{line.variantName}</p>}
          <p className="tabular text-xs text-muted-foreground">{formatCurrency(line.unitPrice)} each</p>
          {line.note && <p className="mt-0.5 text-xs italic text-muted-foreground">↳ {line.note}</p>}
        </div>
        <span className="tabular shrink-0 text-sm font-semibold">
          {formatCurrency(line.unitPrice * line.quantity - line.discountAmount)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Decrease quantity" onClick={() => cart.decrement(line.key)}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <input
          type="number"
          min={1}
          max={999}
          value={line.quantity}
          onChange={(e) => cart.setQuantity(line.key, Number(e.target.value))}
          aria-label={`Quantity of ${line.name}`}
          className="tabular h-8 w-12 rounded border border-input bg-background text-center text-sm"
        />
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Increase quantity" onClick={() => cart.increment(line.key)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>

        <div className="flex-1" />

        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setNoteOpen(true)}>
          Note
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${line.name}`}
          onClick={() => cart.removeLine(line.key)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title={`Note for ${line.name}`} size="sm">
        <div className="space-y-3">
          <Field label="Preparation note" hint="e.g. less sugar, extra shot, oat milk">
            <Textarea
              value={line.note}
              onChange={(e) => cart.setLineNote(line.key, e.target.value)}
              maxLength={255}
              autoFocus
            />
          </Field>
          <Field label="Line discount" hint="Amount off this line">
            <Input
              type="number"
              min={0}
              value={line.discountAmount || ''}
              onChange={(e) => cart.setLineDiscount(line.key, Number(e.target.value))}
              className="tabular"
            />
          </Field>
          <Button className="w-full" onClick={() => setNoteOpen(false)}>
            Done
          </Button>
        </div>
      </Modal>
    </li>
  );
}

function DiscountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cart = useCart();
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED'>(cart.discountType ?? 'PERCENTAGE');
  const [value, setValue] = useState(String(cart.discountValue || ''));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply discount"
      size="sm"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              cart.setOrderDiscount(null, 0);
              setValue('');
              onClose();
            }}
          >
            Remove
          </Button>
          <Button
            onClick={() => {
              cart.setOrderDiscount(type, Number(value) || 0);
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(['PERCENTAGE', 'FIXED'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              aria-pressed={type === option}
              className={cn(
                'touch-target rounded-lg border-2 text-sm font-medium transition-colors',
                type === option ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
              )}
            >
              {option === 'PERCENTAGE' ? 'Percentage (%)' : 'Fixed amount'}
            </button>
          ))}
        </div>

        <Field label={type === 'PERCENTAGE' ? 'Percentage off' : 'Amount off'}>
          <Input
            type="number"
            min={0}
            max={type === 'PERCENTAGE' ? 100 : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="tabular text-lg"
            autoFocus
          />
        </Field>

        {type === 'PERCENTAGE' && (
          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 15, 20].map((preset) => (
              <Button key={preset} variant="outline" size="sm" onClick={() => setValue(String(preset))}>
                {preset}%
              </Button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CustomerPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cart = useCart();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', 'picker', search],
    queryFn: async () => (await api.get<Customer[]>('/customers', { search, pageSize: 20 })).data,
    enabled: open,
  });

  return (
    <Modal open={open} onClose={onClose} title="Select customer" description="Link this sale to a loyalty member">
      <div className="space-y-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone…" autoFocus />

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : !data?.length ? (
          <EmptyState title="No customers found" description="Add customers from the Customers page." />
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {data.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => {
                    cart.setCustomer(customer.id, customer.name);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{customer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {customer.phone ?? customer.code} · {customer.visitCount} visits
                    </p>
                  </div>
                  <Badge tone="primary">{customer.loyaltyPoints} pts</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
