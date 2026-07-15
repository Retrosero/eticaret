export interface StorefrontTenantContext {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly primaryDomain: string;
  readonly currency: 'TRY' | 'EUR' | 'USD';
  readonly locale: string;
}
