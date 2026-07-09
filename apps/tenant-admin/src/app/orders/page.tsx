'use client';

import { useEffect, useState } from 'react';
import { Search, ShoppingCart, Eye } from 'lucide-react';
import Link from 'next/link';
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
import { apiClient, extractApiError } from '@/lib/api-client';
import { formatCurrency, formatDateShort, ORDER_STATUS_LABEL, getStatusBadgeVariant } from '@/lib/utils';
import type { Order } from '@/lib/api-types';

function OrdersContent() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const { data } = await apiClient.get('/orders', {
          params: {
            page,
            pageSize,
            q: search || undefined,
            status: statusFilter || undefined,
          },
        });
        setOrders((data as any).items ?? []);
        setTotal((data as any).total ?? 0);
      } catch (err) {
        setError(extractApiError(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [page, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Siparişler</h2>
        <p className="text-sm text-muted-foreground">Toplam {total} sipariş</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Sipariş no veya müşteri e-postası…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
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
              <option value="pending_payment">Ödeme Bekleniyor</option>
              <option value="awaiting_payment">Ödeme Onayı Bekleniyor</option>
              <option value="paid">Ödendi</option>
              <option value="confirmed">Onaylandı</option>
              <option value="preparing">Hazırlanıyor</option>
              <option value="shipped">Kargoda</option>
              <option value="delivered">Teslim Edildi</option>
              <option value="cancelled">İptal Edildi</option>
              <option value="refunded">İade Edildi</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Yükleniyor…</p>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">Sipariş bulunamadı.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sipariş No</TableHead>
                    <TableHead>Müşteri</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Ödeme</TableHead>
                    <TableHead>Tutar</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link
                          href={`/orders/${o.id}`}
                          className="font-medium hover:underline text-primary"
                        >
                          {o.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{o.customerEmail ?? '—'}</p>
                        {o.customerName && (
                          <p className="text-xs text-muted-foreground">{o.customerName}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(o.status)}>
                          {ORDER_STATUS_LABEL[o.status] ?? o.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={o.paymentStatus === 'captured' ? 'success' : 'outline'}>
                          {o.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(o.grandTotal, o.currency)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateShort(o.placedAt ?? o.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/orders/${o.id}`} aria-label="Detay">
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
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
    </div>
  );
}

export default function OrdersPage() {
  return (
    <DashboardLayout>
      <OrdersContent />
    </DashboardLayout>
  );
}