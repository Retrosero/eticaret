export type TenantUserRole = 'tenant_owner' | 'tenant_admin' | 'tenant_staff';

export interface StoreInfoSettings {
  storeName: string;
  brandName: string;
  description: string;
  logoUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  supportEmail: string;
  supportPhone: string;
  website: string;
  address: string;
  taxOffice: string;
  taxNumber: string;
  mersisNo: string;
  tradeRegistryNo: string;
}

export interface TaxCategorySetting {
  id: string;
  name: string;
  rate: number;
}

export interface InvoiceSettingsForm {
  invoicePrefix: string;
  invoiceSeries: string;
  defaultCurrency: string;
  defaultTaxRate: number;
  taxCategories: TaxCategorySetting[];
}

export interface PaymentProviderSettings {
  enabled: boolean;
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  merchantSalt: string;
  callbackKey: string;
}

export interface PaymentSettingsForm {
  manualBankTransfer: {
    enabled: boolean;
    iban: string;
    accountName: string;
    bankName: string;
  };
  cashOnDelivery: {
    enabled: boolean;
    extraFee: number;
  };
  iyzico: PaymentProviderSettings;
  paytr: PaymentProviderSettings;
  param: PaymentProviderSettings;
}

export interface ShippingProviderSettings {
  enabled: boolean;
  apiKey: string;
  apiSecret: string;
  customerCode: string;
}

export interface ShippingSettingsForm {
  originCity: string;
  freeShippingLimit: number;
  defaultProvider: 'manual' | 'yurtici' | 'mng' | 'aras';
  manual: {
    enabled: boolean;
    label: string;
    etaText: string;
  };
  yurtici: ShippingProviderSettings;
  mng: ShippingProviderSettings;
  aras: ShippingProviderSettings;
}

export interface EmailSettingsForm {
  provider: 'smtp';
  fromName: string;
  fromEmail: string;
  replyTo: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface NotificationSettingsForm {
  newOrderEmail: boolean;
  invoiceEmail: boolean;
  lowStockEmail: boolean;
  newCustomerEmail: boolean;
  campaignEmail: boolean;
}

export interface KvkkSettingsForm {
  privacyEmail: string;
  retentionDays: number;
  clarificationText: string;
  marketingConsentText: string;
}

export interface TeamMemberSettings {
  id: string;
  fullName: string;
  email: string;
  role: TenantUserRole;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TenantSettingsTenantSummary {
  id: string;
  slug: string;
  status: string;
  plan: string;
  primaryDomain: string | null;
  locale: string;
  currency: string;
}

export interface TenantAdminSettings {
  tenant: TenantSettingsTenantSummary;
  storeInfo: StoreInfoSettings;
  invoice: InvoiceSettingsForm;
  payments: PaymentSettingsForm;
  shipping: ShippingSettingsForm;
  email: EmailSettingsForm;
  notifications: NotificationSettingsForm;
  kvkk: KvkkSettingsForm;
  teamMembers: TeamMemberSettings[];
}
