export type Role = 'ADMIN' | 'MANAGER' | 'CASHIER';
export type OrderStatus = 'PENDING' | 'COMPLETED' | 'VOIDED' | 'REFUNDED';
export type OrderChannel = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type PaymentMethod = 'CASH' | 'QRIS' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'EWALLET' | 'BANK_TRANSFER' | 'VOUCHER';
export type UnitType = 'GRAM' | 'KILOGRAM' | 'MILLILITER' | 'LITER' | 'PIECE' | 'PACK' | 'SHOT';
export type StockStatus = 'HEALTHY' | 'LOW' | 'OUT_OF_STOCK';
export type PurchaseOrderStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isDefault: boolean;
}

export interface AuthUser {
  id: string;
  employeeCode: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: string;
  avatarUrl: string | null;
  branchId: string | null;
  branch: Pick<Branch, 'id' | 'name' | 'code'> | null;
  hasPin: boolean;
  lastLoginAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number };
}

export interface ProductVariant {
  id: string;
  name: string;
  priceDelta: number;
  recipeMultiplier: number;
  isDefault: boolean;
  sku?: string | null;
  sortOrder?: number;
}

export interface RecipeLine {
  id: string;
  ingredientId: string;
  quantity: number;
  isOptional: boolean;
  ingredient: { id: string; name: string; unit: UnitType; costPerUnit: number };
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string;
  imageUrl: string | null;
  basePrice: number;
  baseCost: number;
  taxRate: number;
  isActive: boolean;
  isFavorite: boolean;
  trackRecipe: boolean;
  sortOrder: number;
  costPrice: number;
  marginAmount: number;
  marginPercent: number;
  category: { id: string; name: string; color: string };
  variants: ProductVariant[];
  recipe: RecipeLine[];
}

export interface PosProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  basePrice: number;
  taxRate: number;
  isFavorite: boolean;
  costPrice: number;
  variants: Pick<ProductVariant, 'id' | 'name' | 'priceDelta' | 'recipeMultiplier' | 'isDefault'>[];
}

export interface PosCatalog {
  categories: Category[];
  products: PosProduct[];
  syncedAt: string;
}

export interface StockRow {
  ingredientId: string;
  sku: string;
  name: string;
  unit: UnitType;
  quantity: number;
  lowStockAt: number;
  reorderQty: number;
  costPerUnit: number;
  stockValue: number;
  supplier: { id: string; name: string } | null;
  status: StockStatus;
  updatedAt: string;
}

export interface Ingredient {
  id: string;
  sku: string;
  name: string;
  unit: UnitType;
  costPerUnit: number;
  lowStockAt: number;
  reorderQty: number;
  supplierId: string | null;
  isActive: boolean;
  supplier: { id: string; name: string } | null;
  _count?: { recipeIn: number };
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTerm: string | null;
  isActive: boolean;
  _count?: { ingredients: number; purchaseOrders: number };
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  note: string | null;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  status: string;
  amount: number;
  feeAmount: number;
  referenceNo: string | null;
  paidAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  channel: OrderChannel;
  tableNumber: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceAmount: number;
  roundingAmount: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  costTotal: number;
  note: string | null;
  voidReason: string | null;
  createdAt: string;
  completedAt: string | null;
  items: OrderItem[];
  payments: Payment[];
  customer: { id: string; code: string; name: string; phone: string | null; loyaltyPoints: number } | null;
  cashier: { id: string; fullName: string; employeeCode: string };
  branch: { id: string; name: string; code: string; address: string | null; phone: string | null };
}

export interface Receipt {
  order: Order;
  store: {
    name: string;
    address: string | null;
    phone: string | null;
    footer: string;
    logoUrl: string;
    currency: string;
    locale: string;
    taxInclusive: boolean;
  };
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  loyaltyPoints: number;
  totalSpent: number;
  visitCount: number;
  lastVisitAt: string | null;
  note: string | null;
  isActive: boolean;
}

export interface Employee {
  id: string;
  employeeCode: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: string;
  hourlyRate: number | null;
  hiredAt: string | null;
  lastLoginAt: string | null;
  branchId: string | null;
  branch: Pick<Branch, 'id' | 'name' | 'code'> | null;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  paymentMethod: PaymentMethod;
  vendor: string | null;
  note: string | null;
  spentAt: string;
  category: { id: string; name: string; isFixed: boolean };
  createdBy: { id: string; fullName: string } | null;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  isFixed: boolean;
  isActive: boolean;
}

export interface PurchaseOrderItem {
  id: string;
  ingredientId: string;
  quantity: number;
  receivedQty: number;
  unitCost: number;
  lineTotal: number;
  ingredient: { id: string; name: string; unit: UnitType; costPerUnit: number };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  orderedAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  subtotal: number;
  taxAmount: number;
  shippingFee: number;
  total: number;
  note: string | null;
  createdAt: string;
  supplier: { id: string; name: string; phone: string | null; email: string | null };
  items: PurchaseOrderItem[];
  createdBy: { id: string; fullName: string } | null;
}

export interface PeriodSummary {
  range: { from: string; to: string };
  orders: { count: number; voidedCount: number; itemsSold: number; averageTicket: number };
  revenue: { grossSales: number; discounts: number; serviceCharge: number; tax: number; netRevenue: number; collected: number };
  costs: { cogs: number; operatingExpenses: number; paymentFees: number };
  profit: { grossProfit: number; netProfit: number; grossMarginPercent: number; netMarginPercent: number };
  paymentBreakdown: { method: PaymentMethod; count: number; amount: number; fees: number }[];
}

export interface SalesPoint {
  bucket: string;
  revenue: number;
  cost: number;
  profit: number;
  orders: number;
}

export interface DashboardData {
  today: PeriodSummary;
  month: PeriodSummary;
  comparison: { revenueGrowth: number; orderGrowth: number; profitGrowth: number };
  salesTrend: SalesPoint[];
  topProducts: { productId: string; name: string; quantitySold: number; revenue: number }[];
  categoryBreakdown: { categoryId: string; name: string; color: string; revenue: number; quantity: number }[];
  hourlyDistribution: { hour: number; revenue: number; orders: number }[];
  lowStockCount: number;
  recentOrders: {
    id: string;
    orderNumber: string;
    total: number;
    status: OrderStatus;
    channel: OrderChannel;
    createdAt: string;
    cashier: { fullName: string };
    _count: { items: number };
  }[];
  generatedAt: string;
}

export interface AppNotification {
  id: string;
  type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'PURCHASE_ORDER' | 'SHIFT' | 'SYSTEM';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  changes: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; fullName: string; employeeCode: string; role: Role } | null;
}

export interface Shift {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  note: string | null;
  openedAt: string;
  closedAt: string | null;
  user: { id: string; fullName: string; employeeCode?: string };
  _count?: { orders: number };
}

export interface AppSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  receiptFooter: string;
  receiptLogoUrl: string;
  currency: string;
  locale: string;
  taxEnabled: boolean;
  taxRate: number;
  taxInclusive: boolean;
  serviceChargeEnabled: boolean;
  serviceChargeRate: number;
  cashRounding: number;
  orderPrefix: string;
  allowNegativeStock: boolean;
  requireCustomerOnOrder: boolean;
  lowStockAlerts: boolean;
  loyaltyEnabled: boolean;
  loyaltyEarnRate: number;
  enabledPaymentMethods: PaymentMethod[];
  qrisMerchantName: string;
  qrisStaticPayload: string;
  paymentFees: Record<string, number>;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  [key: string]: unknown;
}
