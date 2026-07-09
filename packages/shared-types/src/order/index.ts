/**
 * Sipariş tipleri — Faz 7 iskeleti.
 */

import type { Uuid, IsoDateString, CurrencyCode } from '../common/index.js';

/** Sipariş durumu. */
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'fulfilled'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

/** Ödeme durumu. */
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';

/** Para değeri. */
export interface Money {
  amount: number; // kuruş
  currency: CurrencyCode;
}

/** Sipariş satırı. */
export interface OrderLine {
  variantId: Uuid;
  productTitle: string;
  variantTitle: string;
  quantity: number;
  unitPrice: Money;
  total: Money;
}

/** Sipariş adresi (KVKK — loglanmaz). */
export interface OrderAddress {
  fullName: string;
  phone: string; // +90XXXXXXXXXX
  email: string;
  city: string;
  district: string;
  fullAddress: string;
  postalCode: string;
}

/** Sipariş ana verisi. */
export interface Order {
  id: Uuid;
  number: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerId: Uuid;
  lines: ReadonlyArray<OrderLine>;
  subtotal: Money;
  shippingTotal: Money;
  taxTotal: Money;
  total: Money;
  shippingAddress: OrderAddress;
  billingAddress: OrderAddress;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}
