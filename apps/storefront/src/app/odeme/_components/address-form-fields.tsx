/**
 * Adres form alanları — ortak bileşen.
 *
 * Hem teslimat hem fatura adresi için kullanılır. Form hook'una bağlanır;
 * `prefix` ile alan adları çakışmaz (shippingAddress.fullName vs
 * billingAddress.fullName).
 */

'use client';

import { type UseFormReturn } from 'react-hook-form';
import { Input } from '@eticart/ui';
import type { CheckoutInput } from '@/lib/checkout-schemas';

interface Props {
  readonly prefix: 'shippingAddress' | 'billingAddress';
  readonly form: UseFormReturn<CheckoutInput>;
}

export function AddressFormFields({ prefix, form }: Props): JSX.Element {
  const errors = form.formState.errors[prefix];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Input
        label="Adres Başlığı"
        placeholder="Ev / İş"
        autoComplete="address-line1"
        {...form.register(`${prefix}.title`)}
        error={errors?.title?.message}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Input
          label="Ad Soyad"
          autoComplete="name"
          {...form.register(`${prefix}.fullName`)}
          error={errors?.fullName?.message}
        />
        <Input
          label="Telefon"
          autoComplete="tel"
          placeholder="05551234567"
          inputMode="tel"
          {...form.register(`${prefix}.phone`)}
          error={errors?.phone?.message}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Input
          label="İl"
          autoComplete="address-level1"
          {...form.register(`${prefix}.city`)}
          error={errors?.city?.message}
        />
        <Input
          label="İlçe"
          autoComplete="address-level2"
          {...form.register(`${prefix}.district`)}
          error={errors?.district?.message}
        />
      </div>
      <Input
        label="Posta Kodu"
        autoComplete="postal-code"
        inputMode="numeric"
        maxLength={5}
        {...form.register(`${prefix}.postalCode`)}
        error={errors?.postalCode?.message}
      />
      <Input
        label="Adres Detayı"
        placeholder="Mahalle, sokak, bina no, daire no"
        autoComplete="street-address"
        {...form.register(`${prefix}.addressLine`)}
        error={errors?.addressLine?.message}
      />

      <details
        style={{
          marginTop: 4,
          border: '1px solid var(--theme-border, #e5e7eb)',
          borderRadius: 6,
          padding: 10,
        }}
      >
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Kurumsal fatura bilgileri (opsiyonel)
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <Input
            label="Şirket Adı"
            {...form.register(`${prefix}.companyName`)}
            error={errors?.companyName?.message}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input
              label="VKN/TCKN"
              maxLength={11}
              inputMode="numeric"
              {...form.register(`${prefix}.taxId`)}
              error={errors?.taxId?.message}
            />
            <Input
              label="Vergi Dairesi"
              {...form.register(`${prefix}.taxOffice`)}
              error={errors?.taxOffice?.message}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
