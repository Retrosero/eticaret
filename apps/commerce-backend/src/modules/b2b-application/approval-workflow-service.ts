/**
 * B2B Onay İş Akışı (Approval Workflow) — Faz 8.
 *
 * Limit aşımı, özel indirim, yüksek tutarlı sipariş gibi durumlar için
 * admin onay mekanizması.
 *
 * Akış:
 *  1. Bayi bir işlem başlatır (sipariş, indirim talebi, vb.)
 *  2. Uygun ApprovalWorkflow eşleşir (varsayılan veya kural bazlı)
 *  3. OrderApproval kaydı açılır (stepNumber=1, status=pending)
 *  4. approveRequest → stepNumber ilerler, son adımda APPROVED
 *  5. rejectRequest → status=REJECTED
 */

import { PrismaClient } from '@prisma/client';

import { createLogger } from '@eticart/config';

const log = createLogger({ service: 'approval-workflow-service' });

/**
 * OrderApprovalStatus enum değerleri (Prisma runtime'da küçük harfli string).
 */
const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SKIPPED: 'skipped',
} as const;

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface CreateApprovalRequestInput {
  tenantId: string;
  companyAccountId: string;
  /** DealerOrder ID (B2B sipariş ise). */
  dealerOrderId?: string;
  /** Sipariş numarası (Faz 7 Order.orderNumber) — denetim izi için. */
  orderNumber: string;
  /** Bayi tarafından talep eden kullanıcı. */
  requestedByUserId: string;
  /** Onaya sunulan tutar (decimal). */
  amount: number;
  /** Para birimi. */
  currency?: string;
  /** İş akışı kodu (örn. "HIGH_VALUE_ORDER"); belirtilmezse tenant varsayılanı kullanılır. */
  workflowCode?: string;
  /** Neden. */
  reason: string;
}

export interface PendingApproval {
  id: string;
  workflowName: string;
  orderNumber: string;
  actorId: string | null;
  stepNumber: number;
  amount: number;
  currency: string;
  reason: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/**
 * Verilen tutar ve tenant için uygun ApprovalWorkflow'u bulur.
 * Önce isActive=true + rule ile eşleşen, yoksa tenant'ın isDefault=true iş akışı.
 */
async function resolveWorkflow(
  prisma: PrismaClient,
  tenantId: string,
  amount: number,
  workflowCode?: string,
): Promise<{ id: string; steps: Array<{ id: string; stepNumber: number }> } | null> {
  if (workflowCode) {
    // İsim bazlı arama (code yerine name — şemada code yok)
    const wf = await prisma.approvalWorkflow.findFirst({
      where: { tenantId, name: workflowCode, isActive: true },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });
    if (wf) return { id: wf.id, steps: wf.steps.map((s) => ({ id: s.id, stepNumber: s.stepNumber })) };
  }

  // Tutar bazlı kuralları kontrol et (rule JSON içinde minAmount/maxAmount)
  const allActive = await prisma.approvalWorkflow.findMany({
    where: { tenantId, isActive: true, isDefault: false },
    include: { steps: { orderBy: { stepNumber: 'asc' } } },
  });

  for (const wf of allActive) {
    const rule = (wf.rule ?? {}) as { minAmount?: number; maxAmount?: number };
    const minOk = rule.minAmount == null || amount >= rule.minAmount;
    const maxOk = rule.maxAmount == null || amount <= rule.maxAmount;
    if (minOk && maxOk) {
      return { id: wf.id, steps: wf.steps.map((s) => ({ id: s.id, stepNumber: s.stepNumber })) };
    }
  }

  // Varsayılan workflow
  const def = await prisma.approvalWorkflow.findFirst({
    where: { tenantId, isDefault: true, isActive: true },
    include: { steps: { orderBy: { stepNumber: 'asc' } } },
  });
  if (!def) return null;
  return { id: def.id, steps: def.steps.map((s) => ({ id: s.id, stepNumber: s.stepNumber })) };
}

// ---------------------------------------------------------------------------
// Fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * Onay talebi oluşturur.
 */
export async function createApprovalRequest(
  prisma: PrismaClient,
  input: CreateApprovalRequestInput,
): Promise<{ id: string }> {
  const workflow = await resolveWorkflow(prisma, input.tenantId, input.amount, input.workflowCode);
  if (!workflow) {
    throw new Error(`Uygun onay iş akışı bulunamadı (tenant=${input.tenantId})`);
  }

  const approval = await prisma.orderApproval.create({
    data: {
      tenantId: input.tenantId,
      companyAccountId: input.companyAccountId,
      dealerOrderId: input.dealerOrderId ?? null,
      workflowId: workflow.id,
      orderNumber: input.orderNumber,
      stepNumber: workflow.steps[0]?.stepNumber ?? 1,
      status: APPROVAL_STATUS.PENDING,
      actorId: input.requestedByUserId,
      note: `[${input.currency ?? 'TRY'} ${input.amount}] ${input.reason}`,
    },
    select: { id: true },
  });

  log.info(
    { tenantId: input.tenantId, approvalId: approval.id, orderNumber: input.orderNumber },
    'Onay talebi oluşturuldu',
  );

  return approval;
}

/**
 * Onay talebini kabul eder. Son adımdaysa APPROVED, değilse PENDING ama stepNumber ilerler.
 */
export async function approveRequest(
  prisma: PrismaClient,
  tenantId: string,
  approvalId: string,
  approverUserId: string,
  note?: string,
): Promise<{ status: string; stepNumber: number }> {
  const approval = await prisma.orderApproval.findFirst({
    where: { id: approvalId, tenantId },
    include: {
      workflow: {
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      },
    },
  });

  if (!approval) throw new Error('Onay talebi bulunamadı');
  if (approval.status !== APPROVAL_STATUS.PENDING) {
    throw new Error('Talep zaten sonuçlandırılmış');
  }

  const totalSteps = approval.workflow.steps.length;
  const nextStepNumber = approval.stepNumber + 1;
  const isFinal = approval.stepNumber >= totalSteps;
  const newStatus = isFinal ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.PENDING;

  await prisma.orderApproval.update({
    where: { id: approvalId },
    data: {
      status: newStatus,
      actorId: approverUserId,
      note: note ?? null,
      stepNumber: nextStepNumber,
      decidedAt: isFinal ? new Date() : null,
    },
  });

  log.info(
    { tenantId, approvalId, approverUserId, newStatus, stepNumber: nextStepNumber },
    'Onay talebi işlendi',
  );
  return { status: newStatus, stepNumber: nextStepNumber };
}

/**
 * Onay talebini reddeder.
 */
export async function rejectRequest(
  prisma: PrismaClient,
  tenantId: string,
  approvalId: string,
  approverUserId: string,
  reason: string,
): Promise<void> {
  const approval = await prisma.orderApproval.findFirst({
    where: { id: approvalId, tenantId },
  });

  if (!approval) throw new Error('Onay talebi bulunamadı');
  if (approval.status !== APPROVAL_STATUS.PENDING) {
    throw new Error('Talep zaten sonuçlandırılmış');
  }

  await prisma.orderApproval.update({
    where: { id: approvalId },
    data: {
      status: APPROVAL_STATUS.REJECTED,
      actorId: approverUserId,
      note: reason,
      decidedAt: new Date(),
    },
  });

  log.info({ tenantId, approvalId, approverUserId }, 'Onay talebi reddedildi');
}

/**
 * Açık onay taleplerini listeler (admin paneli için).
 */
export async function listPendingApprovals(
  prisma: PrismaClient,
  tenantId: string,
  companyAccountId?: string,
): Promise<PendingApproval[]> {
  const where: any = { tenantId, status: APPROVAL_STATUS.PENDING };
  if (companyAccountId) where.companyAccountId = companyAccountId;

  const rows = await prisma.orderApproval.findMany({
    where,
    include: { workflow: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return rows.map((r) => {
    // Note içinde [TRY amount] reason formatında saklanan tutarı parse et
    let amount = 0;
    let currency = 'TRY';
    const noteMatch = (r.note ?? '').match(/^\[([A-Z]{3})\s+([\d.]+)\]\s*(.*)$/);
    const reasonText = noteMatch ? (noteMatch[3] ?? '') : (r.note ?? '');
    if (noteMatch && noteMatch[1] && noteMatch[2]) {
      currency = noteMatch[1];
      amount = Number(noteMatch[2]);
    }
    return {
      id: r.id,
      workflowName: r.workflow.name,
      orderNumber: r.orderNumber,
      actorId: r.actorId,
      stepNumber: r.stepNumber,
      amount,
      currency,
      reason: reasonText,
      createdAt: r.createdAt,
    };
  });
}