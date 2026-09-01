'use client';

import { create } from 'zustand';
import type { OrderChannel, PosProduct, ProductVariant } from './types';

export interface CartLine {
  /** Unique per product+variant combination so the same drink with different
   *  sizes stays on separate lines. */
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  unitPrice: number;
  unitCost: number;
  taxRate: number;
  quantity: number;
  discountAmount: number;
  note: string;
}

interface CartState {
  lines: CartLine[];
  customerId: string | null;
  customerName: string | null;
  channel: OrderChannel;
  tableNumber: string;
  orderNote: string;
  discountType: 'PERCENTAGE' | 'FIXED' | null;
  discountValue: number;

  addItem: (product: PosProduct, variant?: Pick<ProductVariant, 'id' | 'name' | 'priceDelta'> | null) => void;
  setQuantity: (key: string, quantity: number) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  removeLine: (key: string) => void;
  setLineDiscount: (key: string, amount: number) => void;
  setLineNote: (key: string, note: string) => void;
  setCustomer: (id: string | null, name: string | null) => void;
  setChannel: (channel: OrderChannel) => void;
  setTableNumber: (value: string) => void;
  setOrderNote: (value: string) => void;
  setOrderDiscount: (type: 'PERCENTAGE' | 'FIXED' | null, value: number) => void;
  clear: () => void;
}

const lineKey = (productId: string, variantId: string | null) => `${productId}::${variantId ?? 'base'}`;

const initial = {
  lines: [] as CartLine[],
  customerId: null,
  customerName: null,
  channel: 'DINE_IN' as OrderChannel,
  tableNumber: '',
  orderNote: '',
  discountType: null,
  discountValue: 0,
};

export const useCart = create<CartState>((set) => ({
  ...initial,

  addItem: (product, variant) =>
    set((state) => {
      const key = lineKey(product.id, variant?.id ?? null);
      const existing = state.lines.find((line) => line.key === key);

      if (existing) {
        return {
          lines: state.lines.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line)),
        };
      }

      return {
        lines: [
          ...state.lines,
          {
            key,
            productId: product.id,
            variantId: variant?.id ?? null,
            name: product.name,
            variantName: variant?.name ?? null,
            unitPrice: product.basePrice + (variant?.priceDelta ?? 0),
            unitCost: product.costPrice,
            taxRate: product.taxRate,
            quantity: 1,
            discountAmount: 0,
            note: '',
          },
        ],
      };
    }),

  setQuantity: (key, quantity) =>
    set((state) => ({
      lines:
        quantity <= 0
          ? state.lines.filter((line) => line.key !== key)
          : state.lines.map((line) => (line.key === key ? { ...line, quantity: Math.min(quantity, 999) } : line)),
    })),

  increment: (key) =>
    set((state) => ({
      lines: state.lines.map((line) =>
        line.key === key ? { ...line, quantity: Math.min(line.quantity + 1, 999) } : line,
      ),
    })),

  decrement: (key) =>
    set((state) => ({
      lines: state.lines
        .map((line) => (line.key === key ? { ...line, quantity: line.quantity - 1 } : line))
        .filter((line) => line.quantity > 0),
    })),

  removeLine: (key) => set((state) => ({ lines: state.lines.filter((line) => line.key !== key) })),

  setLineDiscount: (key, amount) =>
    set((state) => ({
      lines: state.lines.map((line) =>
        line.key === key
          ? { ...line, discountAmount: Math.max(0, Math.min(amount, line.unitPrice * line.quantity)) }
          : line,
      ),
    })),

  setLineNote: (key, note) =>
    set((state) => ({ lines: state.lines.map((line) => (line.key === key ? { ...line, note } : line)) })),

  setCustomer: (customerId, customerName) => set({ customerId, customerName }),
  setChannel: (channel) => set({ channel }),
  setTableNumber: (tableNumber) => set({ tableNumber }),
  setOrderNote: (orderNote) => set({ orderNote }),
  setOrderDiscount: (discountType, discountValue) => set({ discountType, discountValue }),
  clear: () => set(initial),
}));

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  lineDiscounts: number;
  orderDiscount: number;
  discountTotal: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
  estimatedCost: number;
  estimatedProfit: number;
}

/**
 * Mirrors the server pricing rules so the cashier sees a live total without a
 * round-trip. The server total is always authoritative on submit.
 */
export function calculateTotals(
  lines: CartLine[],
  options: {
    discountType: 'PERCENTAGE' | 'FIXED' | null;
    discountValue: number;
    taxEnabled: boolean;
    taxRate: number;
    taxInclusive: boolean;
    serviceChargeEnabled: boolean;
    serviceChargeRate: number;
    cashRounding: number;
  },
): CartTotals {
  const subtotal = lines.reduce((acc, line) => acc + line.unitPrice * line.quantity, 0);
  const lineDiscounts = lines.reduce((acc, line) => acc + line.discountAmount, 0);
  const netAfterLines = subtotal - lineDiscounts;

  let orderDiscount = 0;
  if (options.discountType === 'PERCENTAGE') orderDiscount = (netAfterLines * options.discountValue) / 100;
  else if (options.discountType === 'FIXED') orderDiscount = Math.min(options.discountValue, netAfterLines);

  const taxable = Math.max(0, netAfterLines - orderDiscount);
  const rate = options.taxEnabled ? options.taxRate : 0;

  const taxAmount = options.taxInclusive ? taxable - taxable / (1 + rate) : taxable * rate;
  const serviceAmount = options.serviceChargeEnabled ? taxable * options.serviceChargeRate : 0;

  const rawTotal = options.taxInclusive ? taxable + serviceAmount : taxable + taxAmount + serviceAmount;
  const total =
    options.cashRounding > 0 ? Math.round(rawTotal / options.cashRounding) * options.cashRounding : rawTotal;

  const estimatedCost = lines.reduce((acc, line) => acc + line.unitCost * line.quantity, 0);

  return {
    itemCount: lines.reduce((acc, line) => acc + line.quantity, 0),
    subtotal: round2(subtotal),
    lineDiscounts: round2(lineDiscounts),
    orderDiscount: round2(orderDiscount),
    discountTotal: round2(lineDiscounts + orderDiscount),
    taxAmount: round2(taxAmount),
    serviceAmount: round2(serviceAmount),
    total: round2(total),
    estimatedCost: round2(estimatedCost),
    estimatedProfit: round2(total - taxAmount - estimatedCost),
  };
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
