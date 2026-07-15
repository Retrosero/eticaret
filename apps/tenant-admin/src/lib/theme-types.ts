export type ThemeAssignmentStatus = 'draft' | 'active' | 'archived';

export interface ThemeAssignment {
  id: string;
  tenantId: string;
  themeId: string;
  version: string;
  status: ThemeAssignmentStatus;
  overrides: Record<string, string | number>;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
