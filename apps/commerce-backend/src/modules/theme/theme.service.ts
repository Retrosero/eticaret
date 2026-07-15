import { Inject, Injectable } from '@nestjs/common';
import { ApiError, ErrorCode } from '@eticart/config';
import { ControlPrismaService, CONTROL_PRISMA_TOKEN } from '../../db/prisma.service.js';

export interface ThemeAssignment {
  id: string;
  tenantId: string;
  themeId: string;
  version: string;
  status: 'draft' | 'active' | 'archived';
  overrides: Record<string, string | number>;
  logoUrl: string | null;
  faviconUrl: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AssignmentRow {
  id: string;
  tenant_id: string;
  theme_id: string;
  theme_version: string;
  status: ThemeAssignment['status'];
  overrides: Record<string, string | number> | null;
  logo_url: string | null;
  favicon_url: string | null;
  activated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapAssignment(row: AssignmentRow): ThemeAssignment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    themeId: row.theme_id,
    version: row.theme_version,
    status: row.status,
    overrides: row.overrides ?? {},
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    activatedAt: row.activated_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class ThemeService {
  constructor(@Inject(CONTROL_PRISMA_TOKEN) private readonly prisma: ControlPrismaService) {}

  async listAssignments(tenantId: string): Promise<ThemeAssignment[]> {
    const rows = await this.prisma.client.$queryRawUnsafe<AssignmentRow[]>(
      `SELECT id, tenant_id, theme_id, theme_version, status, overrides,
              logo_url, favicon_url, activated_at, created_at, updated_at
       FROM public.tenant_theme_assignments
       WHERE tenant_id = $1::uuid
       ORDER BY CASE WHEN status = 'active' THEN 0 WHEN status = 'draft' THEN 1 ELSE 2 END,
                updated_at DESC`,
      tenantId,
    );
    return rows.map(mapAssignment);
  }

  async createDraft(
    tenantId: string,
    input: { themeId: string; version: string; overrides?: Record<string, string | number> },
  ): Promise<ThemeAssignment> {
    const rows = await this.prisma.client.$queryRawUnsafe<AssignmentRow[]>(
      `INSERT INTO public.tenant_theme_assignments
         (tenant_id, theme_id, theme_version, status, overrides, created_at, updated_at)
       SELECT $1::uuid, tv.theme_id, tv.version, 'draft', $3::jsonb, NOW(), NOW()
       FROM public.theme_versions tv
       WHERE tv.theme_id = $2 AND tv.version = $4
       RETURNING id, tenant_id, theme_id, theme_version, status, overrides,
                 logo_url, favicon_url, activated_at, created_at, updated_at`,
      tenantId,
      input.themeId,
      JSON.stringify(input.overrides ?? {}),
      input.version,
    );
    const row = rows[0];
    if (!row) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tema sürümü bulunamadı.');
    }
    return mapAssignment(row);
  }

  async publishDraft(tenantId: string, assignmentId: string): Promise<ThemeAssignment> {
    return this.prisma.client.$transaction(async (tx) => {
      const draftRows = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `SELECT id, tenant_id, theme_id, theme_version, status, overrides,
                logo_url, favicon_url, activated_at, created_at, updated_at
         FROM public.tenant_theme_assignments
         WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'draft'
         FOR UPDATE`,
        assignmentId,
        tenantId,
      );
      const draft = draftRows[0];
      if (!draft) {
        throw new ApiError(404, ErrorCode.NOT_FOUND, 'Tenant draft teması bulunamadı.');
      }

      await tx.$executeRawUnsafe(
        `UPDATE public.tenant_theme_assignments
         SET status = 'archived', archived_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1::uuid AND status = 'active'`,
        tenantId,
      );
      const activeRows = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `UPDATE public.tenant_theme_assignments
         SET status = 'active', activated_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'draft'
         RETURNING id, tenant_id, theme_id, theme_version, status, overrides,
                   logo_url, favicon_url, activated_at, created_at, updated_at`,
        assignmentId,
        tenantId,
      );
      return mapAssignment(activeRows[0]!);
    });
  }

  async rollback(tenantId: string, assignmentId: string): Promise<ThemeAssignment> {
    return this.prisma.client.$transaction(async (tx) => {
      const archivedRows = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `SELECT id, tenant_id, theme_id, theme_version, status, overrides,
                logo_url, favicon_url, activated_at, created_at, updated_at
         FROM public.tenant_theme_assignments
         WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'archived'
         FOR UPDATE`,
        assignmentId,
        tenantId,
      );
      const archived = archivedRows[0];
      if (!archived) {
        throw new ApiError(404, ErrorCode.NOT_FOUND, 'Geri alınacak tema sürümü bulunamadı.');
      }

      await tx.$executeRawUnsafe(
        `UPDATE public.tenant_theme_assignments
         SET status = 'archived', archived_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1::uuid AND status = 'active'`,
        tenantId,
      );
      const activeRows = await tx.$queryRawUnsafe<AssignmentRow[]>(
        `UPDATE public.tenant_theme_assignments
         SET status = 'active', activated_at = NOW(), archived_at = NULL, updated_at = NOW()
         WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'archived'
         RETURNING id, tenant_id, theme_id, theme_version, status, overrides,
                   logo_url, favicon_url, activated_at, created_at, updated_at`,
        assignmentId,
        tenantId,
      );
      return mapAssignment(activeRows[0]!);
    });
  }
}
