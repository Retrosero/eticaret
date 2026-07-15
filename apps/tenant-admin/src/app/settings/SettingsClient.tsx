'use client';

import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthStore } from '@/lib/auth-store';
import type { TenantAdminSettings, TenantUserRole } from '@/lib/settings-types';
import { cn, formatDateShort } from '@/lib/utils';

type SettingsTabId =
  | 'overview'
  | 'store'
  | 'invoice'
  | 'payments'
  | 'shipping'
  | 'email'
  | 'kvkk'
  | 'team';

interface NewMemberForm {
  fullName: string;
  email: string;
  password: string;
  role: TenantUserRole;
}

const currencyOptions = [
  { value: 'TRY', label: 'TRY' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
];

const localeOptions = [
  { value: 'tr-TR', label: 'Turkce (TR)' },
  { value: 'en-US', label: 'English (US)' },
];

const shippingProviderOptions = [
  { value: 'manual', label: 'Manuel' },
  { value: 'yurtici', label: 'Yurtici' },
  { value: 'mng', label: 'MNG' },
  { value: 'aras', label: 'Aras' },
];

const teamRoleOptions = [
  { value: 'tenant_owner', label: 'Magaza sahibi' },
  { value: 'tenant_admin', label: 'Yonetici' },
  { value: 'tenant_staff', label: 'Personel' },
];

const tabLabels: Record<SettingsTabId, string> = {
  overview: 'Genel',
  store: 'Magaza',
  invoice: 'Fatura',
  payments: 'Odeme',
  shipping: 'Kargo',
  email: 'E-posta',
  kvkk: 'KVKK',
  team: 'Kullanicilar',
};

function boolInputProps(checked: boolean, onChange: (value: boolean) => void) {
  return {
    checked,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.checked),
  };
}

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase('tr-TR').trim();
}

export function SettingsClient() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const tenantId = useAuthStore((state) => state.tenantId);
  const [settings, setSettings] = useState<TenantAdminSettings | null>(null);
  const [newMember, setNewMember] = useState<NewMemberForm>({
    fullName: '',
    email: '',
    password: '',
    role: 'tenant_staff',
  });
  const [activeTab, setActiveTab] = useState<SettingsTabId>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let ignore = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/local-settings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = (await response.json().catch(() => null)) as
        | TenantAdminSettings
        | { message?: string }
        | null;

      if (ignore) return;

      if (!response.ok || !data || !('tenant' in data)) {
        setError((data && 'message' in data && data.message) || 'Ayarlar yuklenemedi.');
        setIsLoading(false);
        return;
      }

      setSettings(data);
      setIsLoading(false);
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [token]);

  const activeProviderCount = useMemo(() => {
    if (!settings) return 0;
    return [
      settings.payments.manualBankTransfer.enabled,
      settings.payments.cashOnDelivery.enabled,
      settings.payments.iyzico.enabled,
      settings.payments.paytr.enabled,
      settings.payments.param.enabled,
    ].filter(Boolean).length;
  }, [settings]);

  const searchIndex = useMemo<Record<SettingsTabId, string>>(() => {
    if (!settings) {
      return {
        overview: '',
        store: '',
        invoice: '',
        payments: '',
        shipping: '',
        email: '',
        kvkk: '',
        team: '',
      };
    }

    return {
      overview: normalizeSearch(
        [
          'genel profil tenant kullanici plan durum domain para birimi dil',
          user?.fullName,
          user?.email,
          user?.role,
          settings.tenant.slug,
          settings.tenant.id,
          settings.tenant.plan,
          settings.tenant.status,
          settings.tenant.primaryDomain,
          settings.tenant.locale,
          settings.tenant.currency,
        ].join(' '),
      ),
      store: normalizeSearch(
        [
          'magaza marka logo favicon website destek telefon vergi mersis adres aciklama branding',
          settings.storeInfo.storeName,
          settings.storeInfo.brandName,
          settings.storeInfo.description,
          settings.storeInfo.logoUrl,
          settings.storeInfo.logoDarkUrl,
          settings.storeInfo.faviconUrl,
          settings.storeInfo.supportEmail,
          settings.storeInfo.supportPhone,
          settings.storeInfo.website,
          settings.storeInfo.address,
          settings.storeInfo.taxOffice,
          settings.storeInfo.taxNumber,
          settings.storeInfo.mersisNo,
          settings.storeInfo.tradeRegistryNo,
        ].join(' '),
      ),
      invoice: normalizeSearch(
        [
          'fatura vergi kdv seri prefix kategori para birimi',
          settings.invoice.invoicePrefix,
          settings.invoice.invoiceSeries,
          settings.invoice.defaultCurrency,
          String(settings.invoice.defaultTaxRate),
          ...settings.invoice.taxCategories.flatMap((category) => [category.name, String(category.rate)]),
        ].join(' '),
      ),
      payments: normalizeSearch(
        [
          'odeme iyzico paytr param havale eft iban banka kapida odeme merchant callback api',
          settings.payments.manualBankTransfer.iban,
          settings.payments.manualBankTransfer.accountName,
          settings.payments.manualBankTransfer.bankName,
          String(settings.payments.cashOnDelivery.extraFee),
          settings.payments.iyzico.apiKey,
          settings.payments.paytr.apiKey,
          settings.payments.param.apiKey,
        ].join(' '),
      ),
      shipping: normalizeSearch(
        [
          'kargo yurtici mng aras manuel ucretsiz limit musteri kodu cikis sehri teslimat',
          settings.shipping.originCity,
          String(settings.shipping.freeShippingLimit),
          settings.shipping.defaultProvider,
          settings.shipping.manual.label,
          settings.shipping.manual.etaText,
          settings.shipping.yurtici.customerCode,
          settings.shipping.mng.customerCode,
          settings.shipping.aras.customerCode,
        ].join(' '),
      ),
      email: normalizeSearch(
        [
          'e-posta email smtp host port ssl tls bildirim yeni siparis fatura stok kampanya',
          settings.email.fromName,
          settings.email.fromEmail,
          settings.email.replyTo,
          settings.email.host,
          settings.email.username,
          String(settings.email.port),
          String(settings.notifications.newOrderEmail),
          String(settings.notifications.invoiceEmail),
          String(settings.notifications.lowStockEmail),
          String(settings.notifications.newCustomerEmail),
          String(settings.notifications.campaignEmail),
        ].join(' '),
      ),
      kvkk: normalizeSearch(
        [
          'kvkk aydinlatma saklama sureci veri gizlilik pazarlama acik riza',
          settings.kvkk.privacyEmail,
          String(settings.kvkk.retentionDays),
          settings.kvkk.clarificationText,
          settings.kvkk.marketingConsentText,
        ].join(' '),
      ),
      team: normalizeSearch(
        [
          'kullanicilar roller ekip personel yonetici magaza sahibi sifre davet',
          ...settings.teamMembers.flatMap((member) => [
            member.fullName,
            member.email,
            member.role,
            member.status,
          ]),
          newMember.fullName,
          newMember.email,
          newMember.role,
        ].join(' '),
      ),
    };
  }, [newMember.email, newMember.fullName, newMember.role, settings, user]);

  const visibleTabs = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    const allTabs = Object.keys(tabLabels) as SettingsTabId[];

    if (!query) {
      return allTabs;
    }

    return allTabs.filter((tabId) => searchIndex[tabId].includes(query));
  }, [searchIndex, searchQuery]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.includes(activeTab)) {
      const firstVisibleTab = visibleTabs[0];
      if (firstVisibleTab) {
        setActiveTab(firstVisibleTab);
      }
    }
  }, [activeTab, visibleTabs]);

  async function saveSettings() {
    if (!settings || !token) return;

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      ...settings,
      newTeamMember:
        newMember.fullName.trim() || newMember.email.trim() || newMember.password
          ? newMember
          : undefined,
    };

    const response = await fetch('/api/local-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as
      | TenantAdminSettings
      | { message?: string }
      | null;

    if (!response.ok || !data || !('tenant' in data)) {
      setError((data && 'message' in data && data.message) || 'Ayarlar kaydedilemedi.');
      setIsSaving(false);
      return;
    }

    setSettings(data);
    setNewMember({ fullName: '', email: '', password: '', role: 'tenant_staff' });
    setMessage('Ayarlar kaydedildi.');
    setIsSaving(false);
  }

  function setStoreField<K extends keyof TenantAdminSettings['storeInfo']>(
    key: K,
    value: TenantAdminSettings['storeInfo'][K],
  ) {
    setSettings((current) =>
      current ? { ...current, storeInfo: { ...current.storeInfo, [key]: value } } : current,
    );
  }

  function setInvoiceField<K extends keyof TenantAdminSettings['invoice']>(
    key: K,
    value: TenantAdminSettings['invoice'][K],
  ) {
    setSettings((current) =>
      current ? { ...current, invoice: { ...current.invoice, [key]: value } } : current,
    );
  }

  function setTenantField<K extends keyof TenantAdminSettings['tenant']>(
    key: K,
    value: TenantAdminSettings['tenant'][K],
  ) {
    setSettings((current) =>
      current ? { ...current, tenant: { ...current.tenant, [key]: value } } : current,
    );
  }

  function setPaymentField<K extends keyof TenantAdminSettings['payments']>(
    key: K,
    value: TenantAdminSettings['payments'][K],
  ) {
    setSettings((current) =>
      current ? { ...current, payments: { ...current.payments, [key]: value } } : current,
    );
  }

  function setShippingField<K extends keyof TenantAdminSettings['shipping']>(
    key: K,
    value: TenantAdminSettings['shipping'][K],
  ) {
    setSettings((current) =>
      current ? { ...current, shipping: { ...current.shipping, [key]: value } } : current,
    );
  }

  function setEmailField<K extends keyof TenantAdminSettings['email']>(
    key: K,
    value: TenantAdminSettings['email'][K],
  ) {
    setSettings((current) =>
      current ? { ...current, email: { ...current.email, [key]: value } } : current,
    );
  }

  function setNotificationField<K extends keyof TenantAdminSettings['notifications']>(
    key: K,
    value: TenantAdminSettings['notifications'][K],
  ) {
    setSettings((current) =>
      current
        ? { ...current, notifications: { ...current.notifications, [key]: value } }
        : current,
    );
  }

  function setKvkkField<K extends keyof TenantAdminSettings['kvkk']>(
    key: K,
    value: TenantAdminSettings['kvkk'][K],
  ) {
    setSettings((current) =>
      current ? { ...current, kvkk: { ...current.kvkk, [key]: value } } : current,
    );
  }

  function updateTaxCategory(index: number, key: 'name' | 'rate', value: string) {
    setSettings((current) => {
      if (!current) return current;

      const taxCategories = current.invoice.taxCategories.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: key === 'rate' ? Number(value) || 0 : value } : item,
      );

      return { ...current, invoice: { ...current.invoice, taxCategories } };
    });
  }

  function updateTeamRole(memberId: string, role: TenantUserRole) {
    setSettings((current) => {
      if (!current) return current;

      return {
        ...current,
        teamMembers: current.teamMembers.map((member) =>
          member.id === memberId ? { ...member, role } : member,
        ),
      };
    });
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Ayarlar yukleniyor...</div>;
  }

  if (error && !settings) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (!settings) {
    return <div className="text-sm text-muted-foreground">Ayarlar verisi yok.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Ayarlar</h2>
          <p className="text-sm text-muted-foreground">
            Faz 11 ayarlari sekmeli yapida. Arama kutusu tum ayar alanlarinda eslesme yapar.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <div className="relative min-w-0 flex-1 sm:min-w-[320px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Ayarlar icinde ara..."
              className="pl-9"
            />
          </div>
          <Button onClick={saveSettings} disabled={isSaving}>
            {isSaving ? 'Kaydediliyor...' : 'Degisiklikleri kaydet'}
          </Button>
        </div>
      </div>

      {(message || error) && (
        <div className={error ? 'text-sm text-destructive' : 'text-sm text-emerald-700'}>
          {error ?? message}
        </div>
      )}

      <Card>
        <CardContent className="p-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {visibleTabs.map((tabId) => (
              <button
                key={tabId}
                type="button"
                onClick={() => setActiveTab(tabId)}
                className={cn(
                  'shrink-0 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                  activeTab === tabId
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {tabLabels[tabId]}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {searchQuery.trim()
              ? `${visibleTabs.length} sekmede eslesme bulundu.`
              : 'Sekmeler ekran genisligine sigmazsa yatay kaydirabilirsiniz.'}
          </div>
        </CardContent>
      </Card>

      {visibleTabs.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Arama sonucu bulunamadi. Daha genel bir kelime deneyin.
          </CardContent>
        </Card>
      ) : (
        renderActiveTab({
          activeTab,
          settings,
          user,
          tenantId,
          activeProviderCount,
          setTenantField,
          setInvoiceField,
          setStoreField,
          setPaymentField,
          setShippingField,
          setEmailField,
          setNotificationField,
          setKvkkField,
          updateTaxCategory,
          updateTeamRole,
          newMember,
          setNewMember,
        })
      )}
    </div>
  );
}

function renderActiveTab(args: {
  activeTab: SettingsTabId;
  settings: TenantAdminSettings;
  user: ReturnType<typeof useAuthStore.getState>['user'];
  tenantId: string | null;
  activeProviderCount: number;
  setTenantField: <K extends keyof TenantAdminSettings['tenant']>(
    key: K,
    value: TenantAdminSettings['tenant'][K],
  ) => void;
  setInvoiceField: <K extends keyof TenantAdminSettings['invoice']>(
    key: K,
    value: TenantAdminSettings['invoice'][K],
  ) => void;
  setStoreField: <K extends keyof TenantAdminSettings['storeInfo']>(
    key: K,
    value: TenantAdminSettings['storeInfo'][K],
  ) => void;
  setPaymentField: <K extends keyof TenantAdminSettings['payments']>(
    key: K,
    value: TenantAdminSettings['payments'][K],
  ) => void;
  setShippingField: <K extends keyof TenantAdminSettings['shipping']>(
    key: K,
    value: TenantAdminSettings['shipping'][K],
  ) => void;
  setEmailField: <K extends keyof TenantAdminSettings['email']>(
    key: K,
    value: TenantAdminSettings['email'][K],
  ) => void;
  setNotificationField: <K extends keyof TenantAdminSettings['notifications']>(
    key: K,
    value: TenantAdminSettings['notifications'][K],
  ) => void;
  setKvkkField: <K extends keyof TenantAdminSettings['kvkk']>(
    key: K,
    value: TenantAdminSettings['kvkk'][K],
  ) => void;
  updateTaxCategory: (index: number, key: 'name' | 'rate', value: string) => void;
  updateTeamRole: (memberId: string, role: TenantUserRole) => void;
  newMember: NewMemberForm;
  setNewMember: React.Dispatch<React.SetStateAction<NewMemberForm>>;
}) {
  const {
    activeTab,
    settings,
    user,
    tenantId,
    activeProviderCount,
    setTenantField,
    setInvoiceField,
    setStoreField,
    setPaymentField,
    setShippingField,
    setEmailField,
    setNotificationField,
    setKvkkField,
    updateTaxCategory,
    updateTeamRole,
    newMember,
    setNewMember,
  } = args;

  if (activeTab === 'overview') {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="Tenant" value={settings.tenant.slug} hint={tenantId ?? settings.tenant.id} />
          <SummaryCard title="Plan" value={settings.tenant.plan} hint={settings.tenant.status} />
          <SummaryCard title="Odeme" value={`${activeProviderCount} aktif`} hint="Saglayici" />
          <SummaryCard
            title="Kullanicilar"
            value={String(settings.teamMembers.length)}
            hint="Rol atamasi"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profil ve tenant</CardTitle>
            <CardDescription>Oturum ve temel kiraci bilgileri</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ReadOnlyField label="Kullanici" value={user?.fullName ?? '-'} />
            <ReadOnlyField label="E-posta" value={user?.email ?? '-'} />
            <ReadOnlyField label="Rol" value={user?.role ?? '-'} />
            <ReadOnlyField label="Ana domain" value={settings.tenant.primaryDomain ?? '-'} />
            <div className="space-y-2">
              <Label htmlFor="tenant-locale">Dil</Label>
              <Select
                id="tenant-locale"
                value={settings.tenant.locale}
                options={localeOptions}
                onChange={(event) => setTenantField('locale', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-currency">Varsayilan para birimi</Label>
              <Select
                id="tenant-currency"
                value={settings.tenant.currency}
                options={currencyOptions}
                onChange={(event) => {
                  setTenantField('currency', event.target.value);
                  setInvoiceField('defaultCurrency', event.target.value);
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeTab === 'store') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Magaza ve marka</CardTitle>
          <CardDescription>Branding, iletisim ve ticari kimlik bilgileri</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Magaza adi" value={settings.storeInfo.storeName} onChange={(value) => setStoreField('storeName', value)} />
          <Field label="Marka adi" value={settings.storeInfo.brandName} onChange={(value) => setStoreField('brandName', value)} />
          <Field label="Logo URL" value={settings.storeInfo.logoUrl} onChange={(value) => setStoreField('logoUrl', value)} />
          <Field label="Koyu tema logo URL" value={settings.storeInfo.logoDarkUrl} onChange={(value) => setStoreField('logoDarkUrl', value)} />
          <Field label="Favicon URL" value={settings.storeInfo.faviconUrl} onChange={(value) => setStoreField('faviconUrl', value)} />
          <Field label="Web sitesi" value={settings.storeInfo.website} onChange={(value) => setStoreField('website', value)} />
          <Field label="Destek e-postasi" value={settings.storeInfo.supportEmail} onChange={(value) => setStoreField('supportEmail', value)} />
          <Field label="Destek telefonu" value={settings.storeInfo.supportPhone} onChange={(value) => setStoreField('supportPhone', value)} />
          <Field label="Vergi dairesi" value={settings.storeInfo.taxOffice} onChange={(value) => setStoreField('taxOffice', value)} />
          <Field label="VKN / TCKN" value={settings.storeInfo.taxNumber} onChange={(value) => setStoreField('taxNumber', value)} />
          <Field label="MERSIS no" value={settings.storeInfo.mersisNo} onChange={(value) => setStoreField('mersisNo', value)} />
          <Field label="Ticaret sicil no" value={settings.storeInfo.tradeRegistryNo} onChange={(value) => setStoreField('tradeRegistryNo', value)} />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="store-description">Aciklama</Label>
            <Textarea
              id="store-description"
              value={settings.storeInfo.description}
              onChange={(event) => setStoreField('description', event.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="store-address">Adres</Label>
            <Textarea
              id="store-address"
              value={settings.storeInfo.address}
              onChange={(event) => setStoreField('address', event.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activeTab === 'invoice') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fatura ve vergi</CardTitle>
          <CardDescription>Para birimi, seri ve vergi kategori tanimlari</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Fatura prefix" value={settings.invoice.invoicePrefix} onChange={(value) => setInvoiceField('invoicePrefix', value)} />
            <Field label="Fatura seri" value={settings.invoice.invoiceSeries} onChange={(value) => setInvoiceField('invoiceSeries', value)} />
            <div className="space-y-2">
              <Label htmlFor="invoice-currency">Fatura para birimi</Label>
              <Select
                id="invoice-currency"
                value={settings.invoice.defaultCurrency}
                options={currencyOptions}
                onChange={(event) => setInvoiceField('defaultCurrency', event.target.value)}
              />
            </div>
            <NumberField label="Varsayilan KDV" value={settings.invoice.defaultTaxRate} onChange={(value) => setInvoiceField('defaultTaxRate', value)} />
          </div>
          <div className="space-y-3">
            <div className="text-sm font-medium">Vergi kategorileri</div>
            <div className="grid gap-3">
              {settings.invoice.taxCategories.map((category, index) => (
                <div key={category.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_120px]">
                  <Field label={`Kategori ${index + 1}`} value={category.name} onChange={(value) => updateTaxCategory(index, 'name', value)} />
                  <NumberField label="Oran" value={category.rate} onChange={(value) => updateTaxCategory(index, 'rate', String(value))} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activeTab === 'payments') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Odeme saglayicilari</CardTitle>
          <CardDescription>iyzico, PayTR, Param ve manuel odeme bilgileri</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProviderToggle
            title="Manuel havale / EFT"
            checked={settings.payments.manualBankTransfer.enabled}
            onChange={(value) =>
              setPaymentField('manualBankTransfer', { ...settings.payments.manualBankTransfer, enabled: value })
            }
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Banka adi" value={settings.payments.manualBankTransfer.bankName} onChange={(value) => setPaymentField('manualBankTransfer', { ...settings.payments.manualBankTransfer, bankName: value })} />
            <Field label="Hesap adi" value={settings.payments.manualBankTransfer.accountName} onChange={(value) => setPaymentField('manualBankTransfer', { ...settings.payments.manualBankTransfer, accountName: value })} />
            <Field label="IBAN" value={settings.payments.manualBankTransfer.iban} onChange={(value) => setPaymentField('manualBankTransfer', { ...settings.payments.manualBankTransfer, iban: value })} />
          </div>

          <ProviderToggle
            title="Kapida odeme"
            checked={settings.payments.cashOnDelivery.enabled}
            onChange={(value) =>
              setPaymentField('cashOnDelivery', { ...settings.payments.cashOnDelivery, enabled: value })
            }
          />
          <NumberField
            label="Kapida odeme ek ucret"
            value={settings.payments.cashOnDelivery.extraFee}
            onChange={(value) =>
              setPaymentField('cashOnDelivery', { ...settings.payments.cashOnDelivery, extraFee: value })
            }
          />

          <PaymentProviderEditor title="iyzico" value={settings.payments.iyzico} onChange={(value) => setPaymentField('iyzico', value)} />
          <PaymentProviderEditor title="PayTR" value={settings.payments.paytr} onChange={(value) => setPaymentField('paytr', value)} />
          <PaymentProviderEditor title="Param" value={settings.payments.param} onChange={(value) => setPaymentField('param', value)} />
        </CardContent>
      </Card>
    );
  }

  if (activeTab === 'shipping') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kargo ayarlari</CardTitle>
          <CardDescription>Saglayici anahtarlari ve teslimat kurallari</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Cikis sehri" value={settings.shipping.originCity} onChange={(value) => setShippingField('originCity', value)} />
            <NumberField label="Ucretsiz kargo limiti" value={settings.shipping.freeShippingLimit} onChange={(value) => setShippingField('freeShippingLimit', value)} />
            <div className="space-y-2">
              <Label htmlFor="shipping-default">Varsayilan saglayici</Label>
              <Select
                id="shipping-default"
                value={settings.shipping.defaultProvider}
                options={shippingProviderOptions}
                onChange={(event) =>
                  setShippingField(
                    'defaultProvider',
                    event.target.value as TenantAdminSettings['shipping']['defaultProvider'],
                  )
                }
              />
            </div>
          </div>

          <div className="grid gap-4">
            <ShippingProviderEditor
              title="Manuel teslimat"
              checked={settings.shipping.manual.enabled}
              onToggle={(value) => setShippingField('manual', { ...settings.shipping.manual, enabled: value })}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Etiket" value={settings.shipping.manual.label} onChange={(value) => setShippingField('manual', { ...settings.shipping.manual, label: value })} />
                <Field label="Tahmini sure" value={settings.shipping.manual.etaText} onChange={(value) => setShippingField('manual', { ...settings.shipping.manual, etaText: value })} />
              </div>
            </ShippingProviderEditor>
            <ShippingProviderEditor title="Yurtici" checked={settings.shipping.yurtici.enabled} onToggle={(value) => setShippingField('yurtici', { ...settings.shipping.yurtici, enabled: value })}>
              <ProviderCredentialFields value={settings.shipping.yurtici} onChange={(value) => setShippingField('yurtici', value)} />
            </ShippingProviderEditor>
            <ShippingProviderEditor title="MNG" checked={settings.shipping.mng.enabled} onToggle={(value) => setShippingField('mng', { ...settings.shipping.mng, enabled: value })}>
              <ProviderCredentialFields value={settings.shipping.mng} onChange={(value) => setShippingField('mng', value)} />
            </ShippingProviderEditor>
            <ShippingProviderEditor title="Aras" checked={settings.shipping.aras.enabled} onToggle={(value) => setShippingField('aras', { ...settings.shipping.aras, enabled: value })}>
              <ProviderCredentialFields value={settings.shipping.aras} onChange={(value) => setShippingField('aras', value)} />
            </ShippingProviderEditor>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activeTab === 'email') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>E-posta ve bildirimler</CardTitle>
          <CardDescription>SMTP ayarlari ve operasyon bildirimleri</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Gonderici adi" value={settings.email.fromName} onChange={(value) => setEmailField('fromName', value)} />
            <Field label="Gonderici e-postasi" value={settings.email.fromEmail} onChange={(value) => setEmailField('fromEmail', value)} />
            <Field label="Reply-to" value={settings.email.replyTo} onChange={(value) => setEmailField('replyTo', value)} />
            <Field label="SMTP host" value={settings.email.host} onChange={(value) => setEmailField('host', value)} />
            <NumberField label="SMTP port" value={settings.email.port} onChange={(value) => setEmailField('port', value)} />
            <CheckboxField label="SSL / TLS" checked={settings.email.secure} onChange={(value) => setEmailField('secure', value)} />
            <Field label="SMTP kullanici" value={settings.email.username} onChange={(value) => setEmailField('username', value)} />
            <Field label="SMTP sifre" type="password" value={settings.email.password} onChange={(value) => setEmailField('password', value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <CheckboxField label="Yeni sipariste e-posta" checked={settings.notifications.newOrderEmail} onChange={(value) => setNotificationField('newOrderEmail', value)} />
            <CheckboxField label="Fatura olustugunda e-posta" checked={settings.notifications.invoiceEmail} onChange={(value) => setNotificationField('invoiceEmail', value)} />
            <CheckboxField label="Dusuk stok uyarisi" checked={settings.notifications.lowStockEmail} onChange={(value) => setNotificationField('lowStockEmail', value)} />
            <CheckboxField label="Yeni musteri kaydinda e-posta" checked={settings.notifications.newCustomerEmail} onChange={(value) => setNotificationField('newCustomerEmail', value)} />
            <CheckboxField label="Kampanya iletisi" checked={settings.notifications.campaignEmail} onChange={(value) => setNotificationField('campaignEmail', value)} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activeTab === 'kvkk') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>KVKK</CardTitle>
          <CardDescription>Aydinlatma ve saklama metinleri</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="KVKK e-postasi" value={settings.kvkk.privacyEmail} onChange={(value) => setKvkkField('privacyEmail', value)} />
            <NumberField label="Saklama suresi (gun)" value={settings.kvkk.retentionDays} onChange={(value) => setKvkkField('retentionDays', value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kvkk-clarification">Aydinlatma metni</Label>
            <Textarea
              id="kvkk-clarification"
              value={settings.kvkk.clarificationText}
              onChange={(event) => setKvkkField('clarificationText', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kvkk-marketing">Pazarlama acik riza metni</Label>
            <Textarea
              id="kvkk-marketing"
              value={settings.kvkk.marketingConsentText}
              onChange={(event) => setKvkkField('marketingConsentText', event.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kullanicilar ve roller</CardTitle>
        <CardDescription>Kullanici listesi, rol atamasi ve yeni kullanici ekleme</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {settings.teamMembers.map((member) => (
            <div
              key={member.id}
              className="grid gap-3 rounded-md border p-3 md:grid-cols-[1.3fr_1fr_180px_120px] md:items-end"
            >
              <ReadOnlyField label="Ad soyad" value={member.fullName} />
              <ReadOnlyField label="E-posta" value={member.email} />
              <div className="space-y-2">
                <Label htmlFor={`role-${member.id}`}>Rol</Label>
                <Select
                  id={`role-${member.id}`}
                  value={member.role}
                  options={teamRoleOptions}
                  onChange={(event) => updateTeamRole(member.id, event.target.value as TenantUserRole)}
                />
              </div>
              <div className="space-y-2">
                <Label>Durum</Label>
                <div className="flex h-10 items-center justify-between rounded-md border px-3 text-sm">
                  <Badge variant={member.status === 'active' ? 'success' : 'outline'}>
                    {member.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateShort(member.lastLoginAt)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border p-4">
          <div className="mb-3 text-sm font-medium">Yeni kullanici ekle</div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Ad soyad" value={newMember.fullName} onChange={(value) => setNewMember((current) => ({ ...current, fullName: value }))} />
            <Field label="E-posta" value={newMember.email} onChange={(value) => setNewMember((current) => ({ ...current, email: value }))} />
            <Field label="Gecici sifre" type="password" value={newMember.password} onChange={(value) => setNewMember((current) => ({ ...current, password: value }))} />
            <div className="space-y-2">
              <Label htmlFor="new-member-role">Rol</Label>
              <Select
                id="new-member-role"
                value={newMember.role}
                options={teamRoleOptions}
                onChange={(event) =>
                  setNewMember((current) => ({
                    ...current,
                    role: event.target.value as TenantUserRole,
                  }))
                }
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{title}</div>
        <div className="mt-1 text-lg font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex h-10 items-center rounded-md border px-3 text-sm">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" value={String(value)} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
      <input type="checkbox" className="h-4 w-4" {...boolInputProps(checked, onChange)} />
      <span>{label}</span>
    </label>
  );
}

function ProviderToggle({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return <CheckboxField label={title} checked={checked} onChange={onChange} />;
}

function PaymentProviderEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: TenantAdminSettings['payments']['iyzico'];
  onChange: (value: TenantAdminSettings['payments']['iyzico']) => void;
}) {
  return (
    <div className="rounded-md border p-4">
      <ProviderToggle title={title} checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="API key" value={value.apiKey} onChange={(apiKey) => onChange({ ...value, apiKey })} />
        <Field label="API secret" value={value.apiSecret} onChange={(apiSecret) => onChange({ ...value, apiSecret })} />
        <Field label="Merchant ID" value={value.merchantId} onChange={(merchantId) => onChange({ ...value, merchantId })} />
        <Field label="Merchant salt" value={value.merchantSalt} onChange={(merchantSalt) => onChange({ ...value, merchantSalt })} />
        <Field label="Callback key" value={value.callbackKey} onChange={(callbackKey) => onChange({ ...value, callbackKey })} />
      </div>
    </div>
  );
}

function ProviderCredentialFields({
  value,
  onChange,
}: {
  value: TenantAdminSettings['shipping']['yurtici'];
  onChange: (value: TenantAdminSettings['shipping']['yurtici']) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="API key" value={value.apiKey} onChange={(apiKey) => onChange({ ...value, apiKey })} />
      <Field label="API secret" value={value.apiSecret} onChange={(apiSecret) => onChange({ ...value, apiSecret })} />
      <Field label="Musteri kodu" value={value.customerCode} onChange={(customerCode) => onChange({ ...value, customerCode })} />
    </div>
  );
}

function ShippingProviderEditor({
  title,
  checked,
  onToggle,
  children,
}: {
  title: string;
  checked: boolean;
  onToggle: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-4">
      <ProviderToggle title={title} checked={checked} onChange={onToggle} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
