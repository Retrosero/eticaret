/**
 * B2B Approval Workflow servis testleri — Faz 9.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@eticart/config', () => ({
  createLogger: () => ({
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

import {
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  listPendingApprovals,
} from '../approval-workflow-service.js';

function makePrismaMock() {
  const workflows: any[] = [
    {
      id: 'wf-1',
      tenantId: 'tenant-A',
      name: 'HIGH_VALUE_ORDER',
      isActive: true,
      isDefault: false,
      rule: { minAmount: 1000 },
      steps: [
        { id: 's1', stepNumber: 1 },
        { id: 's2', stepNumber: 2 },
      ],
    },
    {
      id: 'wf-default',
      tenantId: 'tenant-A',
      name: 'DEFAULT_WORKFLOW',
      isActive: true,
      isDefault: true,
      rule: {},
      steps: [{ id: 'sd1', stepNumber: 1 }],
    },
  ];
  const approvals: any[] = [];
  let seq = 0;

  return {
    prisma: {
      approvalWorkflow: {
        findFirst: vi.fn(async ({ where }: any) => {
          return workflows.find(
            (w) =>
              w.tenantId === where.tenantId &&
              ((where.name && w.name === where.name) ||
                (where.isDefault && w.isDefault)) &&
              w.isActive,
          ) ?? null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return workflows.filter(
            (w) =>
              w.tenantId === where.tenantId &&
              w.isActive === where.isActive &&
              w.isDefault === where.isDefault,
          );
        }),
      },
      orderApproval: {
        create: vi.fn(async ({ data }: any) => {
          const a = { id: `app-${++seq}`, status: 'pending', ...data };
          approvals.push(a);
          return a;
        }),
        findFirst: vi.fn(async ({ where, include }: any) => {
          const a = approvals.find((x) => x.id === where.id && x.tenantId === where.tenantId);
          if (!a) return null;
          if (include?.workflow) {
            const wf = workflows.find((w) => w.id === a.workflowId);
            return { ...a, workflow: wf };
          }
          return a;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const a = approvals.find((x) => x.id === where.id);
          if (!a) throw new Error('Onay yok');
          Object.assign(a, data);
          return a;
        }),
        findMany: vi.fn(async ({ where, take = 100, include }: any) => {
          let rows = approvals.filter(
            (a) => a.tenantId === where.tenantId && String(a.status) === String(where.status),
          );
          if (where.companyAccountId) rows = rows.filter((a) => a.companyAccountId === where.companyAccountId);
          rows = rows.slice(0, take);
          if (include?.workflow) {
            return rows.map((a) => {
              const wf = workflows.find((w) => w.id === a.workflowId);
              return { ...a, workflow: { name: wf?.name } };
            });
          }
          return rows;
        }),
      },
    },
    workflows,
    approvals,
  };
}

describe('approval-workflow-service (Faz 9)', () => {
  let prisma: any;
  let approvals: any[];

  beforeEach(() => {
    const m = makePrismaMock();
    prisma = m.prisma;
    approvals = m.approvals;
  });

  it('createApprovalRequest: kuralla eşleşen workflow kullanır', async () => {
    const r = await createApprovalRequest(prisma, {  // eslint-disable-next-line no-unused-vars
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      orderNumber: 'TRD-001',
      requestedByUserId: 'user-1',
      amount: 5000,
      reason: 'Büyük sipariş',
    });
    expect(r.id).toBe('app-1');
    expect(approvals[0]!.workflowId).toBe('wf-1'); // minAmount: 1000 ile eşleşti
    expect(approvals[0]!.status).toBe('pending');
  });

  it('createApprovalRequest: kural eşleşmezse default workflow kullanır', async () => {
    await createApprovalRequest(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      orderNumber: 'TRD-002',
      requestedByUserId: 'user-1',
      amount: 100, // minAmount 1000'den küçük
      reason: 'Küçük sipariş',
    });
    expect(approvals[0]!!.workflowId).toBe('wf-default');
  });

  it('approveRequest: ilk adım onayında sonraki adıma geçer', async () => {
    const r = await createApprovalRequest(prisma, {  // eslint-disable-next-line no-unused-vars
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      orderNumber: 'TRD-003',
      requestedByUserId: 'user-1',
      amount: 5000,
      reason: 'test',
    });
    const result = await approveRequest(prisma, 'tenant-A', r.id, 'manager-1');
    expect(approvals[0]!.stepNumber).toBe(2);
    expect(approvals[0]!.status).toBe('pending');
    expect(result.status).toBe('pending');
  });

  it('approveRequest: son adım onayında APPROVED olur', async () => {
    const r = await createApprovalRequest(prisma, {  // eslint-disable-next-line no-unused-vars
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      orderNumber: 'TRD-004',
      requestedByUserId: 'user-1',
      amount: 5000,
      reason: 'test',
    });
    await approveRequest(prisma, 'tenant-A', r.id, 'manager-1');
    const result = await approveRequest(prisma, 'tenant-A', r.id, 'finance-1');
    expect(result.status).toBe('approved');
    expect(approvals[0]!.stepNumber).toBe(3);
  });

  it('rejectRequest: reddedildiğinde REJECTED olur', async () => {
    const r = await createApprovalRequest(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      orderNumber: 'TRD-005',
      requestedByUserId: 'user-1',
      amount: 5000,
      reason: 'test',
    });
    await rejectRequest(prisma, 'tenant-A', r.id, 'manager-1', 'Bütçe aşıldı');
    expect(approvals[0]!.status).toBe('rejected');
    expect(approvals[0]!.note).toBe('Bütçe aşıldı');
  });

  it('listPendingApprovals: açık talepleri listeler (amount note\'tan parse)', async () => {
    await createApprovalRequest(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      orderNumber: 'TRD-006',
      requestedByUserId: 'user-1',
      amount: 5000,
      currency: 'TRY',
      reason: 't1',
    });
    const r2 = await createApprovalRequest(prisma, {
      tenantId: 'tenant-A',
      companyAccountId: 'comp-1',
      orderNumber: 'TRD-007',
      requestedByUserId: 'user-2',
      amount: 10000,
      currency: 'USD',
      reason: 't2',
    });
    await rejectRequest(prisma, 'tenant-A', r2.id, 'manager-1', 'hayır');
    const list = await listPendingApprovals(prisma, 'tenant-A');
    expect(list).toHaveLength(1);
    expect(list[0]!.amount).toBe(5000);
    expect(list[0]!.currency).toBe('TRY');
  });
});