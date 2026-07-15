import { describe, expect, it } from 'vitest';
import { createThemePreviewToken, verifyThemePreviewToken } from '../preview-token.js';

describe('theme preview token', () => {
  it('signs and verifies tenant-scoped draft claims', () => {
    const token = createThemePreviewToken({
      tenantId: 'tenant-a',
      assignmentId: 'assignment-a',
      expiresInSeconds: 60,
    }, 'secret');
    expect(verifyThemePreviewToken(token, 'secret')).toMatchObject({
      tenantId: 'tenant-a',
      assignmentId: 'assignment-a',
    });
  });

  it('rejects tampered or differently signed tokens', () => {
    const token = createThemePreviewToken({ tenantId: 'tenant-a', assignmentId: 'assignment-a' }, 'secret');
    expect(verifyThemePreviewToken(`${token}x`, 'secret')).toBeNull();
    expect(verifyThemePreviewToken(token, 'other-secret')).toBeNull();
  });
});
