import { describe, expect, it, vi } from 'vitest';
import { ThemeService } from '../theme.service.js';

const row = {
  id: 'draft-1',
  tenant_id: 'tenant-a',
  theme_id: 'modern',
  theme_version: '1.0.0',
  status: 'draft' as const,
  overrides: { 'color.primary': '#000000' },
  logo_url: null,
  favicon_url: null,
  activated_at: null,
  created_at: new Date('2026-07-11T00:00:00.000Z'),
  updated_at: new Date('2026-07-11T00:00:00.000Z'),
};

describe('ThemeService', () => {
  it('assignment listesini tenant filtresiyle map eder', async () => {
    const $queryRawUnsafe = vi.fn().mockResolvedValue([row]);
    const service = new ThemeService({ client: { $queryRawUnsafe } } as never);

    const result = await service.listAssignments('tenant-a');

    expect($queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('tenant_id = $1'), 'tenant-a');
    expect(result[0]).toMatchObject({ id: 'draft-1', tenantId: 'tenant-a', status: 'draft' });
  });

  it('başka tenant draft id publish edilemez', async () => {
    const $queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const service = new ThemeService({
      client: {
        $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
          work({ $queryRawUnsafe, $executeRawUnsafe: vi.fn() }),
      },
    } as never);

    await expect(service.publishDraft('tenant-b', 'draft-1')).rejects.toMatchObject({ statusCode: 404 });
    expect($queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      'draft-1',
      'tenant-b',
    );
  });

  it('başka tenant archived tema rollback edilemez', async () => {
    const $queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const service = new ThemeService({
      client: {
        $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
          work({ $queryRawUnsafe, $executeRawUnsafe: vi.fn() }),
      },
    } as never);

    await expect(service.rollback('tenant-b', 'archived-1')).rejects.toMatchObject({ statusCode: 404 });
    expect($queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status = 'archived'"),
      'archived-1',
      'tenant-b',
    );
  });
});
