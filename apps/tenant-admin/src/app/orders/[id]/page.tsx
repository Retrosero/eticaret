'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient, extractApiError } from '@/lib/api-client';
import { formatCurrency, formatDate, ORDER_STATUS_LABEL, getStatusBadgeVariant } from '@/lib/utils';
import type { Order } from '@/lib/api-types';
import { OrderStatusActions } from '@/components/orders/order-status-actions';

interface OrderDetail extends Order {
  items?: Array<{
    id: string;
    productTitle: string;
    skuSnapshot: string;
    quantity: number;
    unitPrice: string;
    totalAmount: string;
    variantTitle?: string | null;
  }>;
  history?: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    actorId: string | null;
    createdAt: string;
  }>;
  shippingAddress?: any;
  billingAddress?: any;
}

function OrderDetailContent() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!orderId) return;
    try {
      setIsLoading(true);
      const { data } = await apiClient.get(`/orders/${orderId}`);
      setOrder(data as OrderDetail);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (isLoading) {
    return <p className="text-muted-foreground">Yükleniyor…</p>;
  }

  if (error || !order) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Sipariş yüklenemedi</CardTitle>
          <CardDescription>{error ?? 'Sipariş bulunamadı'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/orders')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{order.orderNumber}</h2>
          <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Badge variant={getStatusBadgeVariant(order.status)}>
            {ORDER_STATUS_LABEL[order.status] ?? order.status}
          </Badge>
          <Badge variant={order.paymentStatus === 'captured' ? 'success' : 'outline'}>
            {order.paymentStatus}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Sol: Tutar + Kalemler */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tutar Özeti</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ara Toplam</span>
                  <span>{formatCurrency(order.subtotalAmount, order.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">KDV</span>
                  <span>{formatCurrency(order.taxTotal, order.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kargo</span>
                  <span>{formatCurrency(order.shippingTotal, order.currency)}</span>
                </div>
                {parseFloat(order.discountTotal) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>İskonto</span>
                    <span>−{formatCurrency(order.discountTotal, order.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t font-semibold text-base">
                  <span>Toplam</span>
                  <span>{formatCurrency(order.grandTotal, order.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {order.items && order.items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sipariş Kalemleri ({order.items.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="font-medium">{item.productTitle}</p>
                      {item.variantTitle && (
                        <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        SKU: <code>{item.skuSnapshot}</code> • {item.quantity} adet
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCurrency(item.totalAmount, order.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.unitPrice, order.currency)} / adet
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Durum Geçmişi */}
          {order.history && order.history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Durum Geçmişi</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative border-l border-muted pl-4 space-y-3">
                  {order.history.map((h) => (
                    <li key={h.id} className="text-sm">
                      <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                      <p className="font-medium">
                        {ORDER_STATUS_LABEL[h.toStatus] ?? h.toStatus}
                        {h.fromStatus && (
                          <span className="text-muted-foreground">
                            {' '}
                            ({ORDER_STATUS_LABEL[h.fromStatus] ?? h.fromStatus} → )
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(h.createdAt)}
                        {h.actorId && ` • ${h.actorId.slice(0, 8)}…`}
                      </p>
                      {h.note && (
                        <p className="text-xs mt-1 text-muted-foreground italic">"{h.note}"</p>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sağ: Müşteri + Aksiyonlar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Müşteri</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{order.customerName ?? order.customerEmail ?? 'Misafir'}</p>
              {order.customerEmail && (
                <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
              )}
              {order.customerId && (
                <p className="text-xs text-muted-foreground mt-2">
                  ID: <code>{order.customerId.slice(0, 8)}…</code>
                </p>
              )}
            </CardContent>
          </Card>

          {order.paymentProvider && (
            <Card>
              <CardHeader>
                <CardTitle>Ödeme</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  <span className="text-muted-foreground">Sağlayıcı:</span>{' '}
                  <span className="font-medium">{order.paymentProvider}</span>
                </p>
                {order.paymentReference && (
                  <p className="text-sm mt-1">
                    <span className="text-muted-foreground">Referans:</span>{' '}
                    <code className="text-xs">{order.paymentReference}</code>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Durum İşlemleri</CardTitle>
              <CardDescription>Sipariş durumunu yönet</CardDescription>
            </CardHeader>
            <CardContent>
              <OrderStatusActions
                orderId={order.id}
                currentStatus={order.status}
                onSuccess={load}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <DashboardLayout>
      <OrderDetailContent />
    </DashboardLayout>
  );
}