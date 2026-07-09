/**
 * B2B Kredi Limiti servisi — Faz 8.
 *
 * Şema notu: Prisma'da ayrı bir `CreditLimit` tablosu yok. Limit bilgisi
 * CompanyAccount.paymentTermId ile bağlanan PaymentTerm üzerinden yönetilir.
 * Kredi limiti geçmişi (audit trail) `CreditLimitHistory` tablosunda tutulur.
 *
 * Akış:
 *  1. Tenant admin bir firmaya kredi limiti tanımlar (history olarak kayıt)
 *  2. Bayi sipariş verirken mevcut kullanım kontrol edilir
 *  3. Limit aşılırsa sipariş admin onayına düşer (ApprovalWorkflow)
 *  4. Ödeme yapıldıkça kullanım serbest bırakılır
 */

import { PrismaClient } from '@prisma/client';

import { createLogger } from '@eticart/config';
import { Decimal } from '@prisma/client/runtime/library';

const log = createLogger({ service: 'credit-limit-service' });

/**
 * Geçici runtime store — production'da CompanyAccount'a alan eklenecek.
 * Faz 8 sonrası: CompanyAccount.creditLimit, currentUsage, autoApproveUnderLimit alanları.
 */
interface RuntimeCreditState {
  limitAmount: number;
  currentUsage: number;
  autoApproveUnderLimit: number | null;
}

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface SetCreditLimitInput {
  tenantId: string;
  companyAccountId: string;
  /** Toplam kredi limiti. */
  limitAmount: number;
  /** Ödeme vadesi (gün). */
  paymentTermDays: number;
  /** Otomatik onay eşiği. */
  autoApproveUnderLimit?: number;
  /** Değişiklik nedeni. */
  reason?: string;
  /** Değişikliği yapan admin. */
  actorId?: string;
}

export interface CreditCheckResult {
  approved: boolean;
  currentUsage: number;
  limitAmount: number;
  availableAmount: number;
  requestedAmount: number;
  autoApproved: boolean;
}

// ---------------------------------------------------------------------------
// Runtime state yardımcıları
// (Production'a geçişte CompanyAccount'ta bu alanlar tutulur)
// ---------------------------------------------------------------------------

const runtimeStore = new Map<string, RuntimeCreditState>();

/**
 * Test amaçlı: runtime state'i temizler. Production'da çağrılmamalı.
 */
export function __resetCreditStateForTest(): void {
  runtimeStore.clear();
}

function stateKey(tenantId: string, companyAccountId: string): string {
  return `${tenantId}:${companyAccountId}`;
}

function getState(tenantId: string, companyAccountId: string): RuntimeCreditState {
  return runtimeStore.get(stateKey(tenantId, companyAccountId)) ?? {
    limitAmount: 0,
    currentUsage: 0,
    autoApproveUnderLimit: null,
  };
}

function setState(tenantId: string, companyAccountId: string, state: RuntimeCreditState): void {
  runtimeStore.set(stateKey(tenantId, companyAccountId), state);
}

// ---------------------------------------------------------------------------
// Fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * Firmaya kredi limiti tanımlar (veya günceller) ve audit kaydı oluşturur.
 */
export async function setCreditLimit(
  prisma: PrismaClient,
  input: SetCreditLimitInput,
): Promise<{ id: string }> {
  const previous = getState(input.tenantId, input.companyAccountId);

  const company = await prisma.companyAccount.findFirst({
    where: { id: input.companyAccountId, tenantId: input.tenantId },
  });
  if (!company) throw new Error('Firma hesabı bulunamadı');

  setState(input.tenantId, input.companyAccountId, {
    limitAmount: input.limitAmount,
    currentUsage: previous.currentUsage,
    autoApproveUnderLimit: input.autoApproveUnderLimit ?? null,
  });

  // Audit trail — CreditLimitHistory tablosuna yaz
  const history = await prisma.creditLimitHistory.create({
    data: {
      tenantId: input.tenantId,
      companyAccountId: input.companyAccountId,
      previousLimit: new Decimal(previous.limitAmount).toString(),
      newLimit: new Decimal(input.limitAmount).toString(),
      reason: input.reason ?? `Ödeme vadesi: ${input.paymentTermDays} gün, auto: ${input.autoApproveUnderLimit ?? 'yok'}`,
      actorId: input.actorId ?? null,
    },
    select: { id: true },
  });

  log.info(
    {
      tenantId: input.tenantId,
      companyAccountId: input.companyAccountId,
      previousLimit: previous.limitAmount,
      newLimit: input.limitAmount,
      historyId: history.id,
    },
    'Kredi limiti güncellendi',
  );

  return history;
}

/**
 * Sipariş öncesi kredi kontrolü yapar.
 */
export async function checkCreditAvailability(
  _prisma: PrismaClient,
  tenantId: string,
  companyAccountId: string,
  requestedAmount: number,
): Promise<CreditCheckResult> {
  const state = getState(tenantId, companyAccountId);
  const limit = state.limitAmount;
  const usage = state.currentUsage;
  const available = Math.max(0, limit - usage);

  const approved = available >= requestedAmount && limit > 0;
  const autoApproved =
    approved &&
    state.autoApproveUnderLimit !== null &&
    requestedAmount <= state.autoApproveUnderLimit;

  return {
    approved,
    currentUsage: usage,
    limitAmount: limit,
    availableAmount: available,
    requestedAmount,
    autoApproved,
  };
}

/**
 * Sipariş onaylandıktan sonra kredi kullanımını artırır.
 */
export async function reserveCredit(
  prisma: PrismaClient,
  tenantId: string,
  companyAccountId: string,
  amount: number,
  orderId: string,
): Promise<void> {
  const state = getState(tenantId, companyAccountId);
  const newUsage = state.currentUsage + amount;
  setState(tenantId, companyAccountId, { ...state, currentUsage: newUsage });

  await prisma.creditLimitHistory.create({
    data: {
      tenantId,
      companyAccountId,
      previousLimit: new Decimal(state.limitAmount).toString(),
      newLimit: new Decimal(state.limitAmount).toString(),
      reason: `Sipariş ${orderId} için kredi rezerve edildi (+${amount}) — kullanım: ${newUsage}`,
      actorId: null,
    },
  });

  log.info(
    { tenantId, companyAccountId, orderId, amount, newUsage },
    'Kredi rezerve edildi',
  );
}

/**
 * Ödeme alındığında kredi kullanımını serbest bırakır.
 */
export async function releaseCredit(
  prisma: PrismaClient,
  tenantId: string,
  companyAccountId: string,
  amount: number,
  orderId: string,
): Promise<void> {
  const state = getState(tenantId, companyAccountId);
  const newUsage = Math.max(0, state.currentUsage - amount);
  setState(tenantId, companyAccountId, { ...state, currentUsage: newUsage });

  await prisma.creditLimitHistory.create({
    data: {
      tenantId,
      companyAccountId,
      previousLimit: new Decimal(state.limitAmount).toString(),
      newLimit: new Decimal(state.limitAmount).toString(),
      reason: `Sipariş ${orderId} ödemesi alındı (-${amount}) — kullanım: ${newUsage}`,
      actorId: null,
    },
  });

  log.info(
    { tenantId, companyAccountId, orderId, amount, newUsage },
    'Kredi serbest bırakıldı',
  );
}