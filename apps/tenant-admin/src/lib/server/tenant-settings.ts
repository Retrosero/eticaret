import type { TenantAdminSettings } from '@/lib/settings-types';

interface TenantSummaryRow {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
  tenant_plan: string;
  primary_domain: string | null;
  locale: string;
  currency: string;
  invoice_settings: Record<string, unknown> | null;
  kvkk_settings: Record<string, unknown> | null;
  email_settings: Record<string, unknown> | null;
  shipping_settings: Record<string, unknown> | null;
  custom_settings: Record<string, unknown> | null;
  user_full_name: string | null;
  user_email: string | null;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildTenantAdminSettings(
  row: TenantSummaryRow,
  teamMembers: TenantAdminSettings['teamMembers'],
): TenantAdminSettings {
  const invoice = recordValue(row.invoice_settings);
  const kvkk = recordValue(row.kvkk_settings);
  const email = recordValue(row.email_settings);
  const shipping = recordValue(row.shipping_settings);
  const custom = recordValue(row.custom_settings);
  const storeInfo = recordValue(custom['storeInfo']);
  const payments = recordValue(custom['payments']);
  const notifications = recordValue(custom['notifications']);

  const defaultSupportEmail = row.user_email ?? '';

  return {
    tenant: {
      id: row.tenant_id,
      slug: row.tenant_slug,
      status: row.tenant_status,
      plan: row.tenant_plan,
      primaryDomain: row.primary_domain,
      locale: stringValue(row.locale, 'tr-TR'),
      currency: stringValue(row.currency, 'TRY'),
    },
    storeInfo: {
      storeName: stringValue(storeInfo['storeName'], row.tenant_name),
      brandName: stringValue(storeInfo['brandName'], row.tenant_name),
      description: stringValue(storeInfo['description']),
      logoUrl: stringValue(storeInfo['logoUrl']),
      logoDarkUrl: stringValue(storeInfo['logoDarkUrl']),
      faviconUrl: stringValue(storeInfo['faviconUrl']),
      supportEmail: stringValue(storeInfo['supportEmail'], defaultSupportEmail),
      supportPhone: stringValue(storeInfo['supportPhone']),
      website: stringValue(
        storeInfo['website'],
        row.primary_domain ? `https://${row.primary_domain}` : '',
      ),
      address: stringValue(storeInfo['address']),
      taxOffice: stringValue(storeInfo['taxOffice']),
      taxNumber: stringValue(storeInfo['taxNumber']),
      mersisNo: stringValue(storeInfo['mersisNo']),
      tradeRegistryNo: stringValue(storeInfo['tradeRegistryNo']),
    },
    invoice: {
      invoicePrefix: stringValue(invoice['invoicePrefix'], 'FTR'),
      invoiceSeries: stringValue(invoice['invoiceSeries'], '2026'),
      defaultCurrency: stringValue(invoice['defaultCurrency'], row.currency),
      defaultTaxRate: numberValue(invoice['defaultTaxRate'], 20),
      taxCategories: Array.isArray(invoice['taxCategories'])
        ? invoice['taxCategories']
            .map((item, index) => {
              const entry = recordValue(item);
              return {
                id: stringValue(entry['id'], `tax-${index + 1}`),
                name: stringValue(entry['name'], `Kategori ${index + 1}`),
                rate: numberValue(entry['rate'], 20),
              };
            })
            .slice(0, 5)
        : [
            { id: 'tax-standard', name: 'Genel KDV', rate: 20 },
            { id: 'tax-reduced', name: 'Indirimli KDV', rate: 10 },
            { id: 'tax-zero', name: 'Sifir KDV', rate: 0 },
          ],
    },
    payments: {
      manualBankTransfer: {
        enabled: booleanValue(recordValue(payments['manualBankTransfer'])['enabled'], true),
        iban: stringValue(recordValue(payments['manualBankTransfer'])['iban']),
        accountName: stringValue(recordValue(payments['manualBankTransfer'])['accountName']),
        bankName: stringValue(recordValue(payments['manualBankTransfer'])['bankName']),
      },
      cashOnDelivery: {
        enabled: booleanValue(recordValue(payments['cashOnDelivery'])['enabled']),
        extraFee: numberValue(recordValue(payments['cashOnDelivery'])['extraFee'], 0),
      },
      iyzico: {
        enabled: booleanValue(recordValue(payments['iyzico'])['enabled']),
        apiKey: stringValue(recordValue(payments['iyzico'])['apiKey']),
        apiSecret: stringValue(recordValue(payments['iyzico'])['apiSecret']),
        merchantId: stringValue(recordValue(payments['iyzico'])['merchantId']),
        merchantSalt: stringValue(recordValue(payments['iyzico'])['merchantSalt']),
        callbackKey: stringValue(recordValue(payments['iyzico'])['callbackKey']),
      },
      paytr: {
        enabled: booleanValue(recordValue(payments['paytr'])['enabled']),
        apiKey: stringValue(recordValue(payments['paytr'])['apiKey']),
        apiSecret: stringValue(recordValue(payments['paytr'])['apiSecret']),
        merchantId: stringValue(recordValue(payments['paytr'])['merchantId']),
        merchantSalt: stringValue(recordValue(payments['paytr'])['merchantSalt']),
        callbackKey: stringValue(recordValue(payments['paytr'])['callbackKey']),
      },
      param: {
        enabled: booleanValue(recordValue(payments['param'])['enabled']),
        apiKey: stringValue(recordValue(payments['param'])['apiKey']),
        apiSecret: stringValue(recordValue(payments['param'])['apiSecret']),
        merchantId: stringValue(recordValue(payments['param'])['merchantId']),
        merchantSalt: stringValue(recordValue(payments['param'])['merchantSalt']),
        callbackKey: stringValue(recordValue(payments['param'])['callbackKey']),
      },
    },
    shipping: {
      originCity: stringValue(shipping['originCity'], 'Istanbul'),
      freeShippingLimit: numberValue(shipping['freeShippingLimit'], 1500),
      defaultProvider:
        stringValue(shipping['defaultProvider'], 'manual') as TenantAdminSettings['shipping']['defaultProvider'],
      manual: {
        enabled: booleanValue(recordValue(shipping['manual'])['enabled'], true),
        label: stringValue(recordValue(shipping['manual'])['label'], 'Manuel Teslimat'),
        etaText: stringValue(recordValue(shipping['manual'])['etaText'], '1-3 is gunu'),
      },
      yurtici: {
        enabled: booleanValue(recordValue(shipping['yurtici'])['enabled']),
        apiKey: stringValue(recordValue(shipping['yurtici'])['apiKey']),
        apiSecret: stringValue(recordValue(shipping['yurtici'])['apiSecret']),
        customerCode: stringValue(recordValue(shipping['yurtici'])['customerCode']),
      },
      mng: {
        enabled: booleanValue(recordValue(shipping['mng'])['enabled']),
        apiKey: stringValue(recordValue(shipping['mng'])['apiKey']),
        apiSecret: stringValue(recordValue(shipping['mng'])['apiSecret']),
        customerCode: stringValue(recordValue(shipping['mng'])['customerCode']),
      },
      aras: {
        enabled: booleanValue(recordValue(shipping['aras'])['enabled']),
        apiKey: stringValue(recordValue(shipping['aras'])['apiKey']),
        apiSecret: stringValue(recordValue(shipping['aras'])['apiSecret']),
        customerCode: stringValue(recordValue(shipping['aras'])['customerCode']),
      },
    },
    email: {
      provider: 'smtp',
      fromName: stringValue(email['fromName'], row.user_full_name ?? row.tenant_name),
      fromEmail: stringValue(email['fromEmail'], defaultSupportEmail),
      replyTo: stringValue(email['replyTo'], defaultSupportEmail),
      host: stringValue(email['host']),
      port: numberValue(email['port'], 587),
      secure: booleanValue(email['secure']),
      username: stringValue(email['username']),
      password: stringValue(email['password']),
    },
    notifications: {
      newOrderEmail: booleanValue(notifications['newOrderEmail'], true),
      invoiceEmail: booleanValue(notifications['invoiceEmail'], true),
      lowStockEmail: booleanValue(notifications['lowStockEmail'], true),
      newCustomerEmail: booleanValue(notifications['newCustomerEmail']),
      campaignEmail: booleanValue(notifications['campaignEmail']),
    },
    kvkk: {
      privacyEmail: stringValue(kvkk['privacyEmail'], defaultSupportEmail),
      retentionDays: numberValue(kvkk['retentionDays'], 365),
      clarificationText: stringValue(
        kvkk['clarificationText'],
        'Kisisel veriler siparis, destek ve muhasebe sureclerinin yurutilmesi icin islenir.',
      ),
      marketingConsentText: stringValue(
        kvkk['marketingConsentText'],
        'Kampanya iletileri icin acik riza alinmadan gonderim yapilmaz.',
      ),
    },
    teamMembers,
  };
}
