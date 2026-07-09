/**
 * Havale ve Kapıda Ödeme adaptörü birim testleri.
 */

import { describe, it, expect } from 'vitest';

import { ManualBankTransferProvider } from '../manual-bank-transfer/index.js';
import { CashOnDeliveryProvider } from '../cash-on-delivery/index.js';

const BASE_CFG = {
  tenantId: 'tenant-a',
  apiKey: '',
  apiSecret: '',
  sandbox: true,
};

describe('ManualBankTransferProvider', () => {
  it('init — ibanTry/accountHolder zorunlu', async () => {
    const p = new ManualBankTransferProvider();
    await expect(p.init({ ...BASE_CFG, extras: {} })).rejects.toThrow();
  });

  it('init → createPaymentIntent — pending intent döner, redirectUrl yok', async () => {
    const p = new ManualBankTransferProvider();
    await p.init({
      ...BASE_CFG,
      extras: {
        ibanTry: 'TR12 0006 4000 0011 2345 6789 01',
        accountHolder: 'Test Ticaret A.Ş.',
        bankName: 'Ziraat Bankası',
      },
    });
    const intent = await p.createPaymentIntent({
      idempotencyKey: 'k1',
      tenantId: 'tenant-a',
      referenceId: 'cart-1',
      amount: 19990,
      currency: 'TRY',
      items: [],
      customer: {
        email: 'x@y.com',
        firstName: 'A',
        lastName: 'B',
        phone: '+905551234567',
        ipAddress: '1.1.1.1',
        city: 'İstanbul',
        country: 'Turkey',
      },
      shippingAddress: { contactName: 'A B', city: 'İstanbul', country: 'Turkey', address: 'x' },
      billingAddress: { contactName: 'A B', city: 'İstanbul', country: 'Turkey', address: 'x' },
      successUrl: 'https://x',
      failureUrl: 'https://y',
    });
    expect(intent.status).toBe('pending');
    expect(intent.redirectUrl).toBeUndefined();
    expect(intent.providerReference).toMatch(/^manual-/);
  });

  it('confirmPayment — admin onayı gerektirir', async () => {
    const p = new ManualBankTransferProvider();
    await p.init({
      ...BASE_CFG,
      extras: { ibanTry: 'TR12', accountHolder: 'X' },
    });
    await expect(
      p.confirmPayment('intent-1', { token: 't', status: 'success' }),
    ).rejects.toThrow();
  });
});

describe('CashOnDeliveryProvider', () => {
  it('init — devre dışı bırakılabilir', async () => {
    const p = new CashOnDeliveryProvider();
    await expect(
      p.init({ ...BASE_CFG, extras: { codEnabled: false } }),
    ).rejects.toThrow(/devre dışı/);
  });

  it('minimum tutar altında hata verir', async () => {
    const p = new CashOnDeliveryProvider();
    await p.init({
      ...BASE_CFG,
      extras: { codEnabled: true, codMinAmountMinor: 10000 },
    });
    await expect(
      p.createPaymentIntent({
        idempotencyKey: 'k1',
        tenantId: 'tenant-a',
        referenceId: 'r',
        amount: 5000,
        currency: 'TRY',
        items: [],
        customer: {
          email: 'x',
          firstName: 'a',
          lastName: 'b',
          phone: '+90',
          ipAddress: '1',
          city: 'x',
          country: 'TR',
        },
        shippingAddress: { contactName: '', city: '', country: 'TR', address: '' },
        billingAddress: { contactName: '', city: '', country: 'TR', address: '' },
        successUrl: '',
        failureUrl: '',
      }),
    ).rejects.toThrow(/minimum tutar/);
  });

  it('geçerli aralıkta pending intent döner', async () => {
    const p = new CashOnDeliveryProvider();
    await p.init({
      ...BASE_CFG,
      extras: { codEnabled: true, codExtraFeeMinor: 990, codMaxAmountMinor: 1000000 },
    });
    const intent = await p.createPaymentIntent({
      idempotencyKey: 'k1',
      tenantId: 'tenant-a',
      referenceId: 'r',
      amount: 50000,
      currency: 'TRY',
      items: [],
      customer: {
        email: 'x',
        firstName: 'a',
        lastName: 'b',
        phone: '+90',
        ipAddress: '1',
        city: 'x',
        country: 'TR',
      },
      shippingAddress: { contactName: '', city: '', country: 'TR', address: '' },
      billingAddress: { contactName: '', city: '', country: 'TR', address: '' },
      successUrl: '',
      failureUrl: '',
    });
    expect(intent.status).toBe('pending');
    expect(intent.providerReference).toMatch(/^cod-/);
  });
});