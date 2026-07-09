/**
 * Backend API tipleri — admin panelde kullanılan tüm response şekilleri.
 */

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Ürünler
// ---------------------------------------------------------------------------
export interface Product {
  id: string;
  tenantId: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  longDescription: string | null;
  status: 'draft' | 'active' | 'archived';
  brandId: string | null;
  categoryId: string | null;
  taxCategoryId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  tenantId: string;
  productId: string;
  sku: string;
  name: string;
  priceAmount: string;
  compareAtPrice: string | null;
  costAmount: string | null;
  currency: string;
  stockQty: number;
  weight: string | null;
  barcode: string | null;
  isDefault: boolean;
}

// ---------------------------------------------------------------------------
// Siparişler
// ---------------------------------------------------------------------------
export type OrderStatus =
  | 'pending'
  | 'pending_payment'
  | 'awaiting_payment'
  | 'paid'
  | 'confirmed'
  | 'preparing'
  | 'partially_shipped'
  | 'shipped'
  | 'delivered'
  | 'returned'
  | 'refunded'
  | 'cancelled'
  | 'failed'
  | 'closed'
  | 'on_hold';

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'  // ödendi
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'partially_refunded';

export interface Order {
  id: string;
  orderNumber: string;
  tenantId: string;
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: string;
  subtotalAmount: string;
  taxTotal: string;
  shippingTotal: string;
  discountTotal: string;
  grandTotal: string;
  paymentProvider: string | null;
  paymentReference?: string | null;
  itemCount?: number;
  placedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Müşteriler
// ---------------------------------------------------------------------------
export interface Customer {
  id: string;
  tenantId: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  status: 'active' | 'banned' | 'pending_verification';
  totalOrders?: number;
  totalSpent?: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Faturalar
// ---------------------------------------------------------------------------
export interface Invoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  orderId: string;
  invoiceType: 'pdf' | 'e_fatura' | 'e_arsiv' | 'e_irsaliye';
  status: 'draft' | 'issued' | 'cancelled' | 'paid' | 'overdue';
  currency: string;
  totalAmount: string;
  taxTotal: string;
  issuedAt: string | null;
  /** e-Fatura UUID (GİB tarafından atanan). */
  externalUuid?: string | null;
  /** GİB'e gönderim durumu. */
  eInvoiceStatus?:
    | 'not_required'
    | 'pending'
    | 'sent'
    | 'accepted'
    | 'rejected'
    | 'cancelled'
    | 'failed';
  /** Adaptör adı ('nes', 'logo', ...). */
  eFaturaProvider?: string | null;
}

// ---------------------------------------------------------------------------
// Kategoriler / Markalar
// ---------------------------------------------------------------------------
export interface Category {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  parentId: string | null;
  position: number;
}

export interface Brand {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string | null;
}

// ---------------------------------------------------------------------------
// B2B
// ---------------------------------------------------------------------------
export interface CompanyAccount {
  id: string;
  tenantId: string;
  taxId: string;
  legalName: string;
  tradeName: string | null;
  status: 'pending_approval' | 'active' | 'suspended' | 'closed';
  creditLimit: number | null;
  paymentTermDays: number;
  createdAt: string;
}

export interface Quote {
  id: string;
  tenantId: string;
  quoteNumber: string;
  title: string;
  companyAccountId: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
  totalAmount: string;
  currency: string;
  validUntil: string | null;
  createdAt: string;
}

export interface OrderApproval {
  id: string;
  tenantId: string;
  companyAccountId: string;
  orderNumber: string;
  status: 'pending' | 'approved' | 'rejected';
  stepNumber: number;
  actorId: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Dashboard metrikleri
// ---------------------------------------------------------------------------
export interface DashboardMetrics {
  totalOrders: number;
  pendingOrders: number;
  todayRevenue: number;
  monthRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  activeProducts: number;
  pendingApprovals: number;
  recentOrders: Order[];
  topProducts: Array<{ productId: string; title: string; quantity: number; revenue: number }>;
}