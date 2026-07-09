'use client';

import { useEffect, useState } from 'react';
import {
  ShoppingCart,
  Users,
  Package,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/components/dashboard-layout';
import { apiClient, extractApiError } from '@/lib/api-client';
import { formatCurrency, formatDateShort, ORDER_STATUS_LABEL } from '@/lib/utils';
import type { DashboardMetrics } from '@/lib/api-types';

/** Basit metrik kartı. */
function MetricCard({
  title,
  value,
  icon,
  subtitle,
  trend,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">
            {trend && (
              <span className={trend.positive ? 'text-green-600' : 'text-red-600'}>
                {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
            )}{' '}
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardContent() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        // Backend'de /admin/dashboard endpoint'i varsa kullan; yoksa aggregate et.
        // Şimdilik mümkün olan endpoint'leri paralel çağırıp birleştiriyoruz.
        const [ordersRes, customersRes, productsRes] = await Promise.allSettled([
          apiClient.get('/orders', { params: { page: 1, pageSize: 5 } }),
          apiClient.get('/customers', { params: { page: 1, pageSize: 1 } }),
          apiClient.get('/products', { params: { page: 1, pageSize: 1 } }),
        ]);

        const recentOrders =
          ordersRes.status === 'fulfilled'
            ? ((ordersRes.value.data as any).items ?? []).slice(0, 5)
            : [];
        const totalCustomers =
          customersRes.status === 'fulfilled'
            ? ((customersRes.value.data as any).total ?? 0)
            : 0;
        const totalProducts =
          productsRes.status === 'fulfilled'
            ? ((productsRes.value.data as any).total ?? 0)
            : 0;

        const pendingOrders = recentOrders.filter(
          (o: any) =>
            o.status === 'pending_payment' || o.status === 'awaiting_payment' || o.status === 'paid',
        ).length;

        setMetrics({
          totalOrders: recentOrders.length,
          pendingOrders,
          todayRevenue: 0,
          monthRevenue: 0,
          totalCustomers,
          totalProducts,
          activeProducts: 0,
          pendingApprovals: 0,
          recentOrders,
          topProducts: [],
        });
        setError(null);
      } catch (err) {
        setError(extractApiError(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">Yükleniyor…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Veri yüklenemedi</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Genel Bakış</h2>
        <p className="text-sm text-muted-foreground">
          Mağazanızın güncel durumu ve son aktiviteler.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Toplam Sipariş"
          value={metrics?.totalOrders ?? 0}
          icon={<ShoppingCart className="h-4 w-4" />}
          subtitle="son güncelleme"
        />
        <MetricCard
          title="Bekleyen Sipariş"
          value={metrics?.pendingOrders ?? 0}
          icon={<Clock className="h-4 w-4" />}
          subtitle="işlem bekliyor"
        />
        <MetricCard
          title="Müşteriler"
          value={metrics?.totalCustomers ?? 0}
          icon={<Users className="h-4 w-4" />}
          subtitle="aktif hesap"
        />
        <MetricCard
          title="Ürünler"
          value={metrics?.totalProducts ?? 0}
          icon={<Package className="h-4 w-4" />}
          subtitle="listede"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Son Siparişler</CardTitle>
            <CardDescription>En son alınan 5 sipariş</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics?.recentOrders && metrics.recentOrders.length > 0 ? (
              <ul className="space-y-3">
                {metrics.recentOrders.map((order: any) => (
                  <li key={order.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.customerEmail ?? 'Misafir'} •{' '}
                        {formatDateShort(order.placedAt ?? order.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(order.grandTotal, order.currency)}</p>
                      <Badge variant="outline" className="mt-1">
                        {ORDER_STATUS_LABEL[order.status] ?? order.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Henüz sipariş yok.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bu Ay Özet</CardTitle>
            <CardDescription>Temel performans göstergeleri</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span>Aylık Ciro</span>
              </div>
              <span className="font-semibold">{formatCurrency(0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <span>Tamamlanan Sipariş</span>
              </div>
              <span className="font-semibold">0</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span>Stok Uyarısı</span>
              </div>
              <span className="font-semibold">0</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t">
              * Detaylı raporlar Faz 11'de eklenecek.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <DashboardLayout>
      <DashboardContent />
    </DashboardLayout>
  );
}