'use client';

import Link from 'next/link';
import { Truck } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function ShippingContent() {
  const providers = [
    { name: 'Yurtici Kargo', code: 'yurtici', status: 'active', coverage: 'Turkiye' },
    { name: 'MNG Kargo', code: 'mng', status: 'active', coverage: 'Turkiye' },
    { name: 'Aras Kargo', code: 'aras', status: 'skeleton', coverage: 'Turkiye' },
    { name: 'Surat Kargo', code: 'surat', status: 'skeleton', coverage: 'Turkiye' },
    { name: 'Manuel Teslimat', code: 'manual', status: 'active', coverage: '-' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Kargo</h2>
        <p className="text-sm text-muted-foreground">Kargo saglayici yapilandirmasi</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kargo Saglayicilari</CardTitle>
          <CardDescription>Aktif ve planlanan entegrasyonlar</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => (
              <Card key={provider.code}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{provider.name}</p>
                        <p className="text-xs text-muted-foreground">{provider.coverage}</p>
                      </div>
                    </div>
                    <Badge variant={provider.status === 'active' ? 'success' : 'outline'}>
                      {provider.status === 'active' ? 'Aktif' : 'Skeleton'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            API anahtarlari, musteri kodlari ve varsayilan kargo kurallari artik{' '}
            <Link href="/settings" className="underline underline-offset-2">
              Ayarlar
            </Link>{' '}
            sayfasindan yonetiliyor.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ShippingPage() {
  return (
    <DashboardLayout>
      <ShippingContent />
    </DashboardLayout>
  );
}
