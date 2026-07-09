'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Edit, Trash2, Package, Archive, ArchiveRestore } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { apiClient, extractApiError } from '@/lib/api-client';
import { formatDateShort } from '@/lib/utils';
import type { Product } from '@/lib/api-types';
import { ProductFormModal } from '@/components/products/product-form-modal';
import { DeleteProductDialog } from '@/components/products/delete-product-dialog';

function ProductsContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [viewTarget, setViewTarget] = useState<Product | null>(null);

  async function load() {
    try {
      setIsLoading(true);
      const { data } = await apiClient.get('/products', {
        params: {
          page,
          pageSize,
          q: search || undefined,
          status: statusFilter || undefined,
        },
      });
      setProducts((data as any).items ?? []);
      setTotal((data as any).total ?? 0);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, statusFilter]);

  function handleEdit(p: Product) {
    setEditTarget(p);
    setFormOpen(true);
  }

  function handleDelete(p: Product) {
    setDeleteTarget(p);
    setDeleteOpen(true);
  }

  function handleArchiveToggle(p: Product) {
    (async () => {
      try {
        await apiClient.patch(`/products/${p.id}`, {
          status: p.status === 'archived' ? 'active' : 'archived',
        });
        await load();
      } catch (err) {
        setError(extractApiError(err));
      }
    })();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Ürünler</h2>
          <p className="text-sm text-muted-foreground">Toplam {total} ürün</p>
        </div>
        <Button
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Yeni Ürün
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ürün ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    load();
                  }
                }}
                className="pl-10"
              />
            </div>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tüm Durumlar</option>
              <option value="active">Yayında</option>
              <option value="draft">Taslak</option>
              <option value="archived">Arşivlendi</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {error && !isLoading ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Yükleniyor…</p>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">Henüz ürün yok.</p>
              <Button
                className="mt-4"
                onClick={() => {
                  setEditTarget(null);
                  setFormOpen(true);
                }}
              >
                İlk ürünü ekle
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Yayın Tarihi</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <button
                          onClick={() => setViewTarget(p)}
                          className="text-left hover:underline"
                        >
                          <p className="font-medium">{p.title}</p>
                          {p.shortDescription && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {p.shortDescription}
                            </p>
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-muted-foreground">{p.slug}</code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.status === 'active'
                              ? 'success'
                              : p.status === 'draft'
                                ? 'outline'
                                : 'secondary'
                          }
                        >
                          {p.status === 'active'
                            ? 'Yayında'
                            : p.status === 'draft'
                              ? 'Taslak'
                              : 'Arşiv'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateShort(p.publishedAt ?? p.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(p)}
                            aria-label="Düzenle"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleArchiveToggle(p)}
                            aria-label={p.status === 'archived' ? 'Arşivden çıkar' : 'Arşivle'}
                          >
                            {p.status === 'archived' ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(p)}
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

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Sayfa {page} / {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                    >
                      Önceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                    >
                      Sonraki
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Ürün Form Modal (Create/Edit) */}
      <ProductFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editTarget}
        onSuccess={load}
      />

      {/* Silme Onayı */}
      <DeleteProductDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        product={deleteTarget}
        onSuccess={load}
      />

      {/* Ürün Detay Görüntüleme */}
      <Dialog
        open={!!viewTarget}
        onOpenChange={(o) => !o && setViewTarget(null)}
        title={viewTarget?.title}
        description={viewTarget ? `Slug: ${viewTarget.slug}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setViewTarget(null)}>
              Kapat
            </Button>
            <Button
              onClick={() => {
                if (viewTarget) {
                  setEditTarget(viewTarget);
                  setViewTarget(null);
                  setFormOpen(true);
                }
              }}
            >
              Düzenle
            </Button>
          </>
        }
      >
        {viewTarget && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Durum:</span>
              <Badge
                variant={
                  viewTarget.status === 'active'
                    ? 'success'
                    : viewTarget.status === 'draft'
                      ? 'outline'
                      : 'secondary'
                }
              >
                {viewTarget.status === 'active'
                  ? 'Yayında'
                  : viewTarget.status === 'draft'
                    ? 'Taslak'
                    : 'Arşiv'}
              </Badge>
            </div>
            {viewTarget.shortDescription && (
              <div>
                <h4 className="font-medium mb-1">Kısa Açıklama</h4>
                <p className="text-muted-foreground">{viewTarget.shortDescription}</p>
              </div>
            )}
            {viewTarget.longDescription && (
              <div>
                <h4 className="font-medium mb-1">Detaylı Açıklama</h4>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {viewTarget.longDescription}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <span className="text-muted-foreground">Oluşturulma:</span>{' '}
                <span className="font-medium">{formatDateShort(viewTarget.createdAt)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Yayın Tarihi:</span>{' '}
                <span className="font-medium">
                  {formatDateShort(viewTarget.publishedAt)}
                </span>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <DashboardLayout>
      <ProductsContent />
    </DashboardLayout>
  );
}