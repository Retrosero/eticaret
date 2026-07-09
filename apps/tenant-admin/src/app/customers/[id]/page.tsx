'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, ShoppingCart, Shield } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient, extractApiError } from '@/lib/api-client';
import { formatCurrency, formatDateShort } from '@/lib/utils';

interface CustomerDetail {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  totalOrders?: number;
  totalSpent?: number;
  addresses?: Array<{
    id: string;
    fullName: string;
    phone: string;
    city: string;
    district?: string | null;
    addressLine1: string;
    isDefaultShipping: boolean;
    kind: string;
  }>;
}

function CustomerDetailContent() {
  const params = useParams();
  const router = useRouter();
  const customerId = params?.id as string;
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      try {
        setIsLoading(true);
        const { data } = await apiClient.get(`/customers/${customerId}`);
        setCustomer(data as CustomerDetail);
      } catch (err) {
        setError(extractApiError(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [customerId]);

  if (isLoading) return <p className="text-muted-foreground">Yükleniyor…</p>;

  if (error || !customer) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Müşteri yüklenemedi</CardTitle>
          <CardDescription>{error ?? 'Müşteri bulunamadı'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/customers')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{customer.fullName ?? customer.email}</h2>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </div>
        <div className="ml-auto">
          <Badge
            variant={
              customer.status === 'active'
                ? 'success'
                : customer.status === 'banned'
                  ? 'destructive'
                  : 'outline'
            }
          >
            {customer.status === 'active'
              ? 'Aktif'
              : customer.status === 'banned'
                ? 'Engellenmiş'
                : 'Onay Bekliyor'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Toplam Sipariş
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{customer.totalOrders ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Harcama
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(customer.totalSpent ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Kayıt Tarihi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{formatDateShort(customer.createdAt)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Adres Defteri
            </CardTitle>
            <CardDescription>Kayıtlı teslimat adresleri</CardDescription>
          </CardHeader>
          <CardContent>
            {customer.addresses && customer.addresses.length > 0 ? (
              <ul className="space-y-3">
                {customer.addresses.map((a) => (
                  <li key={a.id} className="border rounded-md p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{a.fullName}</p>
                      <div className="flex gap-1">
                        <Badge variant={a.isDefaultShipping ? 'default' : 'outline'}>
                          {a.kind === 'shipping' ? 'Kargo' : a.kind === 'billing' ? 'Fatura' : 'Her İkisi'}
                        </Badge>
                        {a.isDefaultShipping && (
                          <Badge variant="success">Varsayılan</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-muted-foreground mt-1">
                      {a.addressLine1}
                      {a.district && `, ${a.district}`} • {a.city}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{a.phone}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Kayıtlı adres yok.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              KVKK Talepleri
            </CardTitle>
            <CardDescription>Veri ihraç/silme talepleri</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Bu müşterinin aktif KVKK talebi bulunmuyor.
            </p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline">
                Veri İhraç Talebi Oluştur
              </Button>
              <Button size="sm" variant="destructive">
                Hesap Silme
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CustomerDetailPage() {
  return (
    <DashboardLayout>
      <CustomerDetailContent />
    </DashboardLayout>
  );
}