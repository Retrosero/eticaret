/**
 * @eticart/region-router — Multi-region routing for EtiCart.
 */
export * from './region.js';
export * from './geo-router.js';
export * from './edge-cache.js';
export * from './failover.js';
export * from './tenant-residency.js';

export const RegionHelpers = {
  /**
   * Environment'dan aktif region'ı al.
   */
  getActiveRegion(): import('./region.js').RegionCode {
    return (process.env['ETICART_REGION'] ?? 'tr-ist') as import('./region.js').RegionCode;
  },

  /**
   * Region için public hostname (örn. "tr.eticart.com.tr", "eu.eticart.com.tr").
   */
  getRegionHostname(region: import('./region.js').RegionCode): string {
    const map: Record<string, string> = {
      'tr-ist': 'tr.eticart.com.tr',
      'eu-fra': 'eu.eticart.com.tr',
      'us-east': 'us.eticart.com.tr',
      'apac-sin': 'apac.eticart.com.tr',
    };
    return map[region] ?? 'eticart.com.tr';
  },

  /**
   * Region için API endpoint URL.
   */
  getRegionApiUrl(region: import('./region.js').RegionCode): string {
    const map: Record<string, string> = {
      'tr-ist': 'https://api-tr.eticart.com.tr',
      'eu-fra': 'https://api-eu.eticart.com.tr',
      'us-east': 'https://api-us.eticart.com.tr',
      'apac-sin': 'https://api-apac.eticart.com.tr',
    };
    return map[region] ?? 'https://api.eticart.com.tr';
  },
};