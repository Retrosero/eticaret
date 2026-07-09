'use client';

import { useEffect, useState } from 'react';
import { Plus, Tags as TagsIcon, Edit, Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/dialog';
import { apiClient, extractApiError } from '@/lib/api-client';
import type { Brand } from '@/lib/api-types';
import { BrandFormModal } from '@/components/brands/brand-form-modal';

function BrandsContent() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Brand | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function load() {
    try {
      setIsLoading(true);
      const { data } = await apiClient.get('/brands');
      setBrands((data as any).items ?? data ?? []);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`/brands/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Markalar</h2>
          <p className="text-sm text-muted-foreground">Ürün marka yönetimi</p>
        </div>
        <Button
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Yeni Marka
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{brands.length} marka</CardTitle>
        </CardHeader>
        <CardContent>
          {error && !isLoading ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Yükleniyor…</p>
          ) : brands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TagsIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">Henüz marka yok.</p>
              <Button
                className="mt-4"
                onClick={() => {
                  setEditTarget(null);
                  setFormOpen(true);
                }}
              >
                İlk markayı ekle
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marka Adı</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground">{b.slug}</code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {b.description ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditTarget(b);
                            setFormOpen(true);
                          }}
                          aria-label="Düzenle"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(b)}
                          aria-label="Sil"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <BrandFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        brand={editTarget}
        onSuccess={load}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Markayı Silmek İstediğinize Emin Misiniz?"
        description={`"${deleteTarget?.name}" markası silinecek. Ürünlerde bu marka kullanılıyorsa hata alabilirsiniz.`}
        confirmText="Evet, Sil"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}

export default function BrandsPage() {
  return (
    <DashboardLayout>
      <BrandsContent />
    </DashboardLayout>
  );
}