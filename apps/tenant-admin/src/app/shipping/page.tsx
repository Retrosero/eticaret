'use client';

import { Truck } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function ShippingContent() {
  const providers = [
    { name: 'Yurtiçi Kargo', code: 'yurtici', status: 'active', coverage: 'Türkiye' },
    { name: 'MNG Kargo', code: 'mng', status: 'active', coverage: 'Türkiye' },
    { name: 'Aras Kargo', code: 'aras', status: 'skeleton', coverage: 'Türkiye' },
    { name: 'Sürat Kargo', code: 'surat', status: 'skeleton', coverage: 'Türkiye' },
    { name: 'Manuel Teslimat', code: 'manual', status: 'active', coverage: '—' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Kargo</h2>
        <p className="text-sm text-muted-foreground">Kargo sağlayıcı yapılandırması</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kargo Sağlayıcıları</CardTitle>
          <CardDescription>Aktif ve planlanan entegrasyonlar</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((p) => (
              <Card key={p.code}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.coverage}</p>
                      </div>
                    </div>
                    <Badge variant={p.status === 'active' ? 'success' : 'outline'}>
                      {p.status === 'active' ? 'Aktif' : 'Skeleton'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            * API anahtarları ve detaylı ayarlar Faz 11'de eklenecek.
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