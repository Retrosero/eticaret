/**
 * Region Definitions — EtiCart Global Regions.
 *
 * 4 region: Türkiye, Europe, US East, Asia Pacific.
 * Her region kendi PostgreSQL, Redis, CDN edge'ine sahip.
 */

export type RegionCode = 'tr-ist' | 'eu-fra' | 'us-east' | 'apac-sin';

export type RegionStatus = 'active' | 'degraded' | 'down' | 'maintenance';

export interface Region {
  code: RegionCode;
  name: string;
  /** Coğrafi konum (şehir) */
  city: string;
  /** Ülke ISO kodu */
  country: string;
  /** Veri merkezi koordinatları (lat, lng) — geo-distance için */
  lat: number;
  lng: number;
  /** PostgreSQL primary connection string */
  dbPrimary: string;
  /** PostgreSQL read replicas */
  dbReplicas: string[];
  /** Redis endpoint */
  redisUrl: string;
  /** S3/R2 storage region */
  storageRegion: string;
  /** Default locale (Accept-Language fallback) */
  defaultLocale: 'tr' | 'en' | 'de' | 'fr' | 'ja' | 'zh';
  /** Bu region'da KVKK/GDPR zorunlu mu? */
  dataResidencyRequired: boolean;
  /** Düzenleyici kurum (info) */
  regulatory: string;
}

export const REGIONS: Record<RegionCode, Region> = {
  'tr-ist': {
    code: 'tr-ist',
    name: 'Türkiye (İstanbul)',
    city: 'İstanbul',
    country: 'TR',
    lat: 41.0082,
    lng: 28.9784,
    dbPrimary: 'postgres://primary.tr-ist.eticart.internal:5432/eticart',
    dbReplicas: [
      'postgres://replica-1.tr-ist.eticart.internal:5432/eticart',
      'postgres://replica-2.tr-ist.eticart.internal:5432/eticart',
    ],
    redisUrl: 'redis://redis.tr-ist.eticart.internal:6379',
    storageRegion: 'eu-central-1',
    defaultLocale: 'tr',
    dataResidencyRequired: true, // KVKK
    regulatory: 'KVKK (Türkiye)',
  },
  'eu-fra': {
    code: 'eu-fra',
    name: 'Europe (Frankfurt)',
    city: 'Frankfurt',
    country: 'DE',
    lat: 50.1109,
    lng: 8.6821,
    dbPrimary: 'postgres://primary.eu-fra.eticart.internal:5432/eticart',
    dbReplicas: [
      'postgres://replica-1.eu-fra.eticart.internal:5432/eticart',
    ],
    redisUrl: 'redis://redis.eu-fra.eticart.internal:6379',
    storageRegion: 'eu-central-1',
    defaultLocale: 'de',
    dataResidencyRequired: true, // GDPR
    regulatory: 'GDPR (EU)',
  },
  'us-east': {
    code: 'us-east',
    name: 'US East (Virginia)',
    city: 'Ashburn',
    country: 'US',
    lat: 39.0438,
    lng: -77.4874,
    dbPrimary: 'postgres://primary.us-east.eticart.internal:5432/eticart',
    dbReplicas: [
      'postgres://replica-1.us-east.eticart.internal:5432/eticart',
    ],
    redisUrl: 'redis://redis.us-east.eticart.internal:6379',
    storageRegion: 'us-east-1',
    defaultLocale: 'en',
    dataResidencyRequired: false,
    regulatory: 'CCPA (California)',
  },
  'apac-sin': {
    code: 'apac-sin',
    name: 'Asia Pacific (Singapore)',
    city: 'Singapore',
    country: 'SG',
    lat: 1.3521,
    lng: 103.8198,
    dbPrimary: 'postgres://primary.apac-sin.eticart.internal:5432/eticart',
    dbReplicas: [
      'postgres://replica-1.apac-sin.eticart.internal:5432/eticart',
    ],
    redisUrl: 'redis://redis.apac-sin.eticart.internal:6379',
    storageRegion: 'ap-southeast-1',
    defaultLocale: 'en',
    dataResidencyRequired: false,
    regulatory: 'PDPA (Singapore)',
  },
};

/** Default region (kullanıcı konumu belirsiz ise) */
export const DEFAULT_REGION: RegionCode = 'tr-ist';

/** Tüm region kodları */
export const ALL_REGION_CODES: RegionCode[] = Object.keys(REGIONS) as RegionCode[];

/**
 * Region sağlık durumu (DB'den veya health check'ten okunur).
 */
export interface RegionHealth {
  code: RegionCode;
  status: RegionStatus;
  /** Latency (ms) — son health check */
  latencyMs: number;
  /** Son kontrol zamanı */
  lastCheckedAt: string;
  /** Aktif replica sayısı */
  activeReplicas: number;
  /** CPU load (0-1) */
  cpuLoad: number;
}