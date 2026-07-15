'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@eticart/ui';
import { apiClient, extractApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type { ThemeAssignment } from '@/lib/theme-types';

const THEMES = [
  { id: 'modern', name: 'Modern MaÄŸaza', description: 'GeniÅŸ gÃ¶rseller ve Ã§aÄŸdaÅŸ grid dÃ¼zeni.' },
  { id: 'classic', name: 'Klasik MaÄŸaza', description: 'YoÄŸun kataloglar iÃ§in geleneksel dÃ¼zen.' },
  { id: 'atelier', name: 'Atölye', description: 'Moda, kozmetik ve yaşam ürünleri için premium editoryal vitrin.' },
  { id: 'trade', name: 'Ticaret Pro', description: 'B2B, bayi ve yoğun katalog satışı için hızlı satın alma odağı.' },
] as const;

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-';
}

export function ThemesClient() {
  const user = useAuthStore((state) => state.user);
  const [assignments, setAssignments] = useState<ThemeAssignment[]>([]);
  const [themeId, setThemeId] = useState('modern');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<ThemeAssignment[]>('/api/admin/theme/assignments');
      setAssignments(response.data);
      const active = response.data.find((item) => item.status === 'active');
      if (active) setThemeId(active.themeId);
    } catch (cause) {
      setError(extractApiError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  async function createDraft() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const draft = await apiClient.post<ThemeAssignment>('/api/admin/theme/drafts', {
        themeId,
        version: '1.0.0',
      });
      setMessage(`${themeId} temasÄ± taslak olarak oluÅŸturuldu.`);
      await loadAssignments();
    } catch (cause) {
      setError(extractApiError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function publish(assignmentId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.post('/api/admin/theme/publish', { assignmentId });
      setMessage('Tema yayÄ±nlandÄ±.');
      await loadAssignments();
    } catch (cause) {
      setError(extractApiError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function preview(assignmentId: string) {
    setError(null);
    try {
      const response = await apiClient.post<{ token: string }>('/api/admin/theme/preview-token', { assignmentId });
      const base = process.env['NEXT_PUBLIC_STOREFRONT_URL'] ?? window.location.origin;
      window.open(`${base.replace(/\/$/, '')}/preview/${response.data.token}`, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(extractApiError(cause));
    }
  }

  async function rollback(assignmentId: string) {
    if (!window.confirm('Bu tema sÃ¼rÃ¼mÃ¼ne geri dÃ¶nÃ¼lsÃ¼n mÃ¼?')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.post('/api/admin/theme/rollback', { assignmentId });
      setMessage('Tema Ã¶nceki sÃ¼rÃ¼me geri alÄ±ndÄ±.');
      await loadAssignments();
    } catch (cause) {
      setError(extractApiError(cause));
    } finally {
      setBusy(false);
    }
  }

  const active = assignments.find((item) => item.status === 'active');
  const canManage = user?.role === 'tenant_admin' || user?.role === 'super_admin';

  return (
    <div className="space-y-6">
      <Card padding elevation="shadow">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Aktif tema</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {active ? `${active.themeId} Â· ${active.version} Â· ${formatDate(active.activatedAt)}` : 'Aktif tema yok'}
            </p>
          </div>
          <div className="flex items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Yeni tema</span>
              <select className="h-10 rounded-md border bg-background px-3" value={themeId} onChange={(event) => setThemeId(event.target.value)}>
                {THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
              </select>
            </label>
            <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={busy || !canManage} onClick={() => void createDraft()}>
              {busy ? 'Ä°ÅŸleniyorâ€¦' : 'Taslak oluÅŸtur'}
            </button>
          </div>
        </div>
        {message && <p className="mt-4 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {THEMES.map((theme) => (
          <Card key={theme.id} padding elevation="shadow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{theme.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{theme.description}</p>
              </div>
              {active?.themeId === theme.id && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Aktif</span>}
            </div>
          </Card>
        ))}
      </div>

      <Card padding elevation="shadow">
        <h2 className="text-lg font-semibold">Tema geÃ§miÅŸi</h2>
        {loading ? <p className="mt-4 text-sm text-muted-foreground">YÃ¼kleniyorâ€¦</p> : assignments.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">HenÃ¼z tema kaydÄ± yok.</p> : (
          <div className="mt-4 divide-y">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <span className="font-medium">{assignment.themeId}</span>
                  <span className="ml-2 text-muted-foreground">v{assignment.version} Â· {formatDate(assignment.updatedAt)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{assignment.status}</span>
                  {assignment.status === 'draft' && canManage && (
                    <>
                      <button className="text-primary underline-offset-4 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void preview(assignment.id)}>Preview</button>
                      <button className="text-primary underline-offset-4 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void publish(assignment.id)}>YayÄ±nla</button>
                    </>
                  )}
                  {assignment.status === 'archived' && canManage && <button className="text-primary underline-offset-4 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void rollback(assignment.id)}>Geri al</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

