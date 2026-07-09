/**
 * Checkout formu — Client Component.
 *
 * İki adımlı:
 *   1) Adım 1 — Adres: mevcut adresler listesi + yeni adres formu
 *   2) Adım 2 — Ödeme: yöntem seçimi + sipariş özeti
 *
 * - React Hook Form + Zod validasyonu
 * - Adres eklemek için yeni adres formu (AddressFormFields)
 * - Submit'te POST /api/store/checkout — response.redirectUrl varsa iyzico 3DS,
 *   yoksa başarı sayfasına yönlendir.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Input,
  Card,
  TrCurrency,
} from '@eticart/ui';
import { useCartStore, hydrateCartStore } from '@/lib/cart-store.js';
import { getApiClient, ApiError } from '@/lib/api-client.js';
import { checkoutSchema, type CheckoutInput } from '@/lib/checkout-schemas.js';
import { formatPriceKurus } from '@/lib/format.js';
import { IyzicoRedirect } from './iyzico-redirect.js';
import { AddressFormFields } from './address-form-fields.js';

interface SavedAddress {
  readonly id: string;
  readonly title: string;
  readonly fullName: string;
  readonly phone: string;
  readonly city: string;
  readonly district: string;
  readonly postalCode: string;
  readonly addressLine: string;
}

interface CheckoutResponse {
  readonly orderId?: string;
  readonly orderNumber?: string;
  readonly redirectUrl?: string;
  readonly paymentStatus?: string;
}

export function CheckoutForm(): JSX.Element {
  const router = useRouter();

  const itemCount = useCartStore((s) => s.itemCount);
  const subtotal = useCartStore((s) => s.subtotalKurus);
  const shipping = useCartStore((s) => s.shippingKurus);
  const discount = useCartStore((s) => s.discountKurus);
  const grandTotal = useCartStore((s) => s.grandTotalKurus);
  const currency = useCartStore((s) => s.currency);
  const isLoading = useCartStore((s) => s.isLoading);
  const isDemo = useCartStore((s) => s.isDemo);
  const resetLocal = useCartStore((s) => s.resetLocal);

  const [step, setStep] = useState<1 | 2>(1);
  const [savedAddresses, setSavedAddresses] = useState<ReadonlyArray<SavedAddress>>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  // İlk mount'ta hidre et
  useEffect(() => {
    hydrateCartStore();
    // Mevcut adresleri backend'den çek (anon ise boş döner)
    void loadSavedAddresses();
  }, []);

  // Sepet boşsa geri yönlendir
  useEffect(() => {
    if (!isLoading && itemCount === 0 && typeof window !== 'undefined') {
      // Demo modda ürün yoksa sepet sayfasına geri gönder
      router.replace('/sepet');
    }
  }, [itemCount, isLoading, router]);

  const form = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      shippingAddress: {
        title: 'Ev',
        fullName: '',
        phone: '',
        city: '',
        district: '',
        postalCode: '',
        addressLine: '',
        companyName: '',
        taxId: '',
        taxOffice: '',
      },
      billingSameAsShipping: true,
      paymentMethod: 'iyzico',
      acceptTerms: false,
      kvkkConsent: false,
    },
    mode: 'onBlur',
  });

  const billingSameAsShipping = form.watch('billingSameAsShipping');

  const loadSavedAddresses = async (): Promise<void> => {
    try {
      const client = getApiClient();
      const res = await client.get<{ items?: ReadonlyArray<SavedAddress> }>(
        '/api/store/customer/addresses',
      );
      setSavedAddresses(res.items ?? []);
    } catch {
      // Anonim ya da backend hazır değil — boş liste kullanılır
      setSavedAddresses([]);
    }
  };

  const handleAddressSelect = (id: string): void => {
    setSelectedAddressId(id);
    if (id !== 'new') {
      const found = savedAddresses.find((a) => a.id === id);
      if (found) {
        form.setValue('shippingAddress', {
          title: found.title,
          fullName: found.fullName,
          phone: found.phone,
          city: found.city,
          district: found.district,
          postalCode: found.postalCode ?? '',
          addressLine: found.addressLine,
          companyName: '',
          taxId: '',
          taxOffice: '',
        });
      }
    }
  };

  const handleContinueToPayment = async (): Promise<void> => {
    const ok = await form.trigger(['shippingAddress', 'kvkkConsent']);
    if (!ok) return;
    if (form.getValues('billingSameAsShipping') === false) {
      const okBilling = await form.trigger(['billingAddress']);
      if (!okBilling) return;
    }
    setStep(2);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBackToAddress = (): void => {
    setStep(1);
  };

  const handleSubmit: SubmitHandler<CheckoutInput> = async (values): Promise<void> => {
    setSubmitError(null);
    try {
      const client = getApiClient();
      const payload: Record<string, unknown> = {
        shippingAddress: values.shippingAddress,
        billingSameAsShipping: values.billingSameAsShipping,
        paymentMethod: values.paymentMethod,
      };
      if (values.billingSameAsShipping === false && values.billingAddress !== undefined) {
        payload['billingAddress'] = values.billingAddress;
      }
      const res = await client.post<CheckoutResponse>('/api/store/checkout', payload);

      if (res.redirectUrl !== undefined && res.redirectUrl.length > 0) {
        // iyzico 3DS — yönlendir
        setRedirectUrl(res.redirectUrl);
        return;
      }

      // Demo mod ya da doğrudan başarı
      const orderNumber = res.orderNumber ?? res.orderId ?? '';
      resetLocal();
      if (orderNumber.length > 0) {
        router.push(`/odeme/basarili?orderNumber=${encodeURIComponent(orderNumber)}`);
      } else {
        router.push('/odeme/basarili');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(`${err.code}: ${err.message}`);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Sipariş oluşturulamadı');
      }
    }
  };

  // Demo mod uyarısı
  const demoWarning = useMemo(() => {
    if (isDemo) {
      return 'Demo mod: backend bağlantısı bekleniyor. Sipariş onayı simüle edilir.';
    }
    return null;
  }, [isDemo]);

  if (redirectUrl !== null) {
    return <IyzicoRedirect url={redirectUrl} />;
  }

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      noValidate
      aria-label="Ödeme formu"
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Adım göstergesi */}
      <nav aria-label="Ödeme adımları" style={{ display: 'flex', gap: 12 }}>
        <StepBadge number={1} active={step === 1} done={step === 2}>
          Adres
        </StepBadge>
        <StepBadge number={2} active={step === 2} done={false}>
          Ödeme
        </StepBadge>
      </nav>

      {demoWarning !== null ? (
        <div
          role="status"
          style={{
            padding: '8px 12px',
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {demoWarning}
        </div>
      ) : null}

      {step === 1 ? (
        <Card>
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Teslimat Adresi</h2>

          {savedAddresses.length > 0 ? (
            <fieldset style={{ marginBottom: 16, border: 0, padding: 0 }}>
              <legend style={{ fontWeight: 600, marginBottom: 8 }}>Kayıtlı Adreslerim</legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {savedAddresses.map((addr) => (
                  <label
                    key={addr.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                      border:
                        selectedAddressId === addr.id
                          ? '2px solid var(--theme-primary, #111827)'
                          : '1px solid var(--theme-border, #e5e7eb)',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="savedAddress"
                      value={addr.id}
                      checked={selectedAddressId === addr.id}
                      onChange={() => handleAddressSelect(addr.id)}
                    />
                    <span>
                      <strong>{addr.title}</strong>
                      <br />
                      <small>
                        {addr.fullName} — {addr.district}/{addr.city}
                      </small>
                    </span>
                  </label>
                ))}
                <label
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: 12,
                    border:
                      selectedAddressId === 'new'
                        ? '2px solid var(--theme-primary, #111827)'
                        : '1px solid var(--theme-border, #e5e7eb)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="savedAddress"
                    value="new"
                    checked={selectedAddressId === 'new'}
                    onChange={() => handleAddressSelect('new')}
                  />
                  <span>
                    <strong>Yeni Adres Ekle</strong>
                  </span>
                </label>
              </div>
            </fieldset>
          ) : null}

          <AddressFormFields prefix="shippingAddress" form={form} />

          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid var(--theme-border, #e5e7eb)',
            }}
          >
            <label
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 12 }}
            >
              <input
                type="checkbox"
                {...form.register('billingSameAsShipping')}
                defaultChecked
              />
              Fatura adresi teslimat adresiyle aynı
            </label>

            {billingSameAsShipping === false ? (
              <div style={{ marginTop: 12 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>Fatura Adresi</h3>
                <AddressFormFields prefix="billingAddress" form={form} />
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'flex-start' }}>
              <input type="checkbox" {...form.register('kvkkConsent')} aria-invalid={Boolean(form.formState.errors.kvkkConsent) || undefined} />
              <span>
                <strong>KVKK aydınlatma metnini</strong> okudum, kişisel verilerimin sipariş sürecinde
                işlenmesini onaylıyorum.
              </span>
            </label>
            {form.formState.errors.kvkkConsent !== undefined ? (
              <p role="alert" style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
                {form.formState.errors.kvkkConsent.message}
              </p>
            ) : null}
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                {...form.register('acceptTerms')}
                aria-invalid={Boolean(form.formState.errors.acceptTerms) || undefined}
              />
              <span>
                <strong>Mesafeli satış sözleşmesini</strong> okudum, kabul ediyorum.
              </span>
            </label>
            {form.formState.errors.acceptTerms !== undefined ? (
              <p role="alert" style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
                {form.formState.errors.acceptTerms.message}
              </p>
            ) : null}
          </div>

          <div style={{ marginTop: 20 }}>
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={() => void handleContinueToPayment()}
            >
              Ödeme Yöntemine Geç
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Ödeme Yöntemi</h2>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <legend className="sr-only" style={{ position: 'absolute', left: -9999 }}>
              Ödeme yöntemi seçimi
            </legend>

            <PaymentOption
              id="iyzico"
              title="Kredi/Banka Kartı (iyzico 3D Secure)"
              description="Güvenli 3D Secure ödeme. Visa, Mastercard, Troy."
              selected={form.watch('paymentMethod') === 'iyzico'}
              onSelect={() => form.setValue('paymentMethod', 'iyzico', { shouldValidate: true })}
            />
            <PaymentOption
              id="bank_transfer"
              title="Havale / EFT"
              description="Sipariş onayından sonra IBAN'a ödeme yapabilirsiniz."
              selected={form.watch('paymentMethod') === 'bank_transfer'}
              onSelect={() => form.setValue('paymentMethod', 'bank_transfer', { shouldValidate: true })}
            />
            <PaymentOption
              id="cash_on_delivery"
              title="Kapıda Ödeme"
              description="Teslimat sırasında nakit veya kart ile ödeyebilirsiniz."
              selected={form.watch('paymentMethod') === 'cash_on_delivery'}
              onSelect={() => form.setValue('paymentMethod', 'cash_on_delivery', { shouldValidate: true })}
            />
          </fieldset>
          {form.formState.errors.paymentMethod !== undefined ? (
            <p role="alert" style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>
              {form.formState.errors.paymentMethod.message}
            </p>
          ) : null}

          {submitError !== null ? (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: 12,
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {submitError}
            </div>
          ) : null}

          <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button type="button" variant="secondary" size="lg" onClick={handleBackToAddress}>
              Geri
            </Button>
            <Button type="submit" variant="primary" size="lg" loading={form.formState.isSubmitting}>
              Siparişi Tamamla
            </Button>
          </div>
        </Card>
      )}

      {/* Sipariş özeti her zaman görünür */}
      <Card>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Sipariş Özeti</h2>
        <dl style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, margin: 0 }}>
          <Row label="Ürün Adedi" value={String(itemCount)} />
          <Row label="Ara Toplam" value={formatPriceKurus(subtotal, currency)} />
          <Row label="Kargo" value={shipping === 0 ? 'Ücretsiz' : formatPriceKurus(shipping, currency)} />
          {discount > 0 ? <Row label="İndirim" value={`-${formatPriceKurus(discount, currency)}`} accent /> : null}
          <hr style={{ border: 0, borderTop: '1px solid var(--theme-border, #e5e7eb)', margin: '8px 0' }} />
          <Row label="Genel Toplam" value={<TrCurrency amount={grandTotal} decimals={2} />} bold />
        </dl>
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Alt bileşenler
// ---------------------------------------------------------------------------

interface StepBadgeProps {
  readonly number: number;
  readonly active: boolean;
  readonly done: boolean;
  readonly children: React.ReactNode;
}

function StepBadge({ number, active, done, children }: StepBadgeProps): React.ReactElement {
  const bg = active ? 'var(--theme-primary, #111827)' : done ? '#16a34a' : 'var(--theme-bg, #e5e7eb)';
  const fg = active || done ? '#fff' : 'var(--theme-text, #111827)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        background: active ? 'rgba(17,24,39,0.08)' : 'transparent',
      }}
      aria-current={active ? 'step' : undefined}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: bg,
          color: fg,
          fontWeight: 700,
          fontSize: 12,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done ? '✓' : number}
      </span>
      <span style={{ fontWeight: active ? 700 : 400 }}>{children}</span>
    </div>
  );
}

interface PaymentOptionProps {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function PaymentOption({ id, title, description, selected, onSelect }: PaymentOptionProps): React.ReactElement {
  return (
    <label
      htmlFor={`pay-${id}`}
      style={{
        display: 'flex',
        gap: 12,
        padding: 14,
        border: selected
          ? '2px solid var(--theme-primary, #111827)'
          : '1px solid var(--theme-border, #e5e7eb)',
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      <input
        id={`pay-${id}`}
        type="radio"
        name="paymentMethod"
        value={id}
        checked={selected}
        onChange={onSelect}
      />
      <span>
        <strong>{title}</strong>
        <br />
        <small style={{ color: 'var(--theme-muted, #6b7280)' }}>{description}</small>
      </span>
    </label>
  );
}

interface RowProps {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly bold?: boolean;
  readonly accent?: boolean;
}

function Row({ label, value, bold = false, accent = false }: RowProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <dt style={{ margin: 0 }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontWeight: bold ? 700 : 500,
          fontSize: bold ? 18 : 14,
          color: accent ? '#16a34a' : 'inherit',
        }}
      >
        {value}
      </dd>
    </div>
  );
}
