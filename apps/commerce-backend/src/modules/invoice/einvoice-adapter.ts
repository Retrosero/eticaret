/**
 * E-Fatura adaptör yöneticisi (Singleton registry).
 *
 * NES adaptörünü yapılandırır ve registry'ye kaydeder.
 * Tenant başına farklı adaptör mümkün (Faz 11+).
 */
import {
  EInvoiceAdapterRegistry,
  NesClient,
  type EInvoiceAdapter,
  type AdapterCredentials,
} from '@eticart/einvoice-adapters';
import { createLogger } from '@eticart/config';

const log = createLogger({ service: 'invoice/einvoice-adapter' });

let registryInstance: EInvoiceAdapterRegistry | null = null;
let initialized = false;

/**
 * Registry'yi döner. İlk çağrıda env değişkenlerinden yapılandırır.
 */
export function getEInvoiceRegistry(): EInvoiceAdapterRegistry {
  if (registryInstance) return registryInstance;
  registryInstance = new EInvoiceAdapterRegistry();
  return registryInstance;
}

/**
 * Ortam değişkenlerinden adaptör registry'sini başlatır.
 * Idempotent — birden fazla çağrılabilir.
 */
export function initEInvoiceAdapters(): void {
  if (initialized) return;
  initialized = true;

  const registry = getEInvoiceRegistry();

  // NES adaptörü (Logo İşbaşı)
  if (process.env.NES_API_KEY && process.env.NES_API_SECRET) {
    const nes = new NesClient();
    nes.configure({
      apiKey: process.env.NES_API_KEY,
      apiSecret: process.env.NES_API_SECRET,
      customerId: process.env.NES_CUSTOMER_ID,
      testMode: process.env.NES_TEST_MODE === 'true',
      baseUrl: process.env.NES_BASE_URL,
    } satisfies AdapterCredentials);
    registry.register(nes);
    log.info(
      { testMode: process.env.NES_TEST_MODE === 'true' },
      'NES e-Fatura adaptörü kaydedildi',
    );
  } else {
    log.warn(
      'NES_API_KEY/NES_API_SECRET tanımlı değil — e-Fatura adaptörü kaydedilmedi. ' +
        'EInvoiceType değerleri için uygun fallback kullanılacak.',
    );
  }
}

/**
 * Adaptörü ada göre döner (varsayılan: 'nes').
 */
export function getEInvoiceAdapter(name = 'nes'): EInvoiceAdapter | undefined {
  initEInvoiceAdapters();
  return getEInvoiceRegistry().get(name);
}