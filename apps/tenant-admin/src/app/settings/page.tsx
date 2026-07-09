'use client';

import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/auth-store';
import { Badge } from '@/components/ui/badge';

function SettingsContent() {
  const user = useAuthStore((s: any) => s.user);
  const tenantId = useAuthStore((s: any) => s.tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Ayarlar</h2>
        <p className="text-sm text-muted-foreground">Hesap ve kiracı yapılandırması</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Giriş yapan kullanıcı bilgileri</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <span className="text-muted-foreground">Ad Soyad:</span>
            <span className="font-medium">{user?.fullName ?? '—'}</span>

            <span className="text-muted-foreground">E-posta:</span>
            <span className="font-medium">{user?.email ?? '—'}</span>

            <span className="text-muted-foreground">Rol:</span>
            <div>
              <Badge>{user?.role ?? '—'}</Badge>
            </div>

            <span className="text-muted-foreground">Kiracı ID:</span>
            <code className="text-xs">{tenantId ?? user?.tenantId ?? '—'}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yakında</CardTitle>
          <CardDescription>Faz 11'de eklenecek ayarlar</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
            <li>Mağaza bilgileri (logo, açıklama, iletişim)</li>
            <li>Para birimi ve vergi kategorileri</li>
            <li>Ödeme sağlayıcıları (iyzico/PayTR/Param API anahtarları)</li>
            <li>Kargo sağlayıcıları (Yurtiçi/MNG/Aras API)</li>
            <li>E-posta/SMTP ayarları</li>
            <li>Bildirim tercihleri</li>
            <li>KVKK aydınlatma metinleri</li>
            <li>Ek kullanıcılar ve rol atamaları</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <SettingsContent />
    </DashboardLayout>
  );
}