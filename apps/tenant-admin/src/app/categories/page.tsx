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
import type { Category } from '@/lib/api-types';
import { CategoryFormModal } from '@/components/categories/category-form-modal';

function CategoriesContent() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function load() {
    try {
      setIsLoading(true);
      const { data } = await apiClient.get('/categories');
      setCategories((data as any).items ?? data ?? []);
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
      await apiClient.delete(`/categories/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsDeleting(false);
    }
  }

  // Üst kategori adını bul
  function parentName(id: string | null): string {
    if (!id) return '— Ana Kategori —';
    return categories.find((c) => c.id === id)?.name ?? id.slice(0, 8) + '…';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Kategoriler</h2>
          <p className="text-sm text-muted-foreground">Ürün kategori ağacı</p>
        </div>
        <Button
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Yeni Kategori
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{categories.length} kategori</CardTitle>
        </CardHeader>
        <CardContent>
          {error && !isLoading ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Yükleniyor…</p>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TagsIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">Henüz kategori yok.</p>
              <Button
                className="mt-4"
                onClick={() => {
                  setEditTarget(null);
                  setFormOpen(true);
                }}
              >
                İlk kategoriyi ekle
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Üst Kategori</TableHead>
                  <TableHead>Sıra</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground">{c.slug}</code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{parentName(c.parentId)}</TableCell>
                    <TableCell className="text-sm">{c.position}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditTarget(c);
                            setFormOpen(true);
                          }}
                          aria-label="Düzenle"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(c)}
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

      <CategoryFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editTarget}
        categories={categories}
        onSuccess={load}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Kategoriyi Silmek İstediğinize Emin Misiniz?"
        description={`"${deleteTarget?.name}" kategorisi silinecek. Alt kategoriler ve bu kategoriye bağlı ürünler etkilenebilir.`}
        confirmText="Evet, Sil"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <DashboardLayout>
      <CategoriesContent />
    </DashboardLayout>
  );
}