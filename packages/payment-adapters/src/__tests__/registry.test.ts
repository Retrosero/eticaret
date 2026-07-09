/**
 * PaymentProviderRegistry birim testleri.
 */

import { describe, it, expect } from 'vitest';

import { PaymentProviderRegistry, type PaymentProvider, type PaymentProviderCode } from '../index.js';

class DummyProvider implements PaymentProvider {
  readonly code: PaymentProviderCode = 'iyzico';
  init = async (): Promise<void> => {};
  createPaymentIntent = async () =>
    ({ providerReference: '', provider: this.code, status: 'pending' as const });
  confirmPayment = async () => ({
    providerReference: '',
    status: 'pending' as const,
    amount: 0,
    currency: 'TRY' as const,
  });
  refund = async () => ({ success: true, amount: 0, currency: 'TRY' as const });
  getStatus = async () => ({
    providerReference: '',
    status: 'pending' as const,
    amount: 0,
    currency: 'TRY' as const,
  });
  handleWebhook = async () => ({
    provider: this.code,
    eventType: 'x',
    providerReference: '',
    status: 'pending' as const,
    raw: null,
  });
}

describe('PaymentProviderRegistry', () => {
  it('register → get round-trip', () => {
    const r = new PaymentProviderRegistry();
    const p = new DummyProvider();
    r.register(p);
    expect(r.get('iyzico')).toBe(p);
  });

  it('aynı kod iki kez kaydedilemez', () => {
    const r = new PaymentProviderRegistry();
    r.register(new DummyProvider());
    expect(() => r.register(new DummyProvider())).toThrow();
  });

  it('list() kayıtlı kodları döner', () => {
    const r = new PaymentProviderRegistry();
    r.register(new DummyProvider());
    expect(r.list()).toContain('iyzico');
  });
});