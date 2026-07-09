/**
 * Geo-Router — Kullanıcının IP/koordinatından en yakın region'ı seç.
 *
 * Strateji:
 * 1. Tenant'ın pin'lendiği region varsa → onu kullan
 * 2. Kullanıcının IP'si → ülke kodu → ülke-region mapping
 * 3. Manuel override (X-Region header)
 * 4. Geo-distance (Haversine formula) — fallback
 * 5. Default region
 */
import type { RegionCode } from './region.js';
import { REGIONS, DEFAULT_REGION } from './region.js';

// ───────────────────────────────────────────────────────────
// COUNTRY → REGION MAPPING
// ───────────────────────────────────────────────────────────

/** Ülke kodu → region mapping (production'da MaxMind GeoIP2 kullanılır). */
const COUNTRY_TO_REGION: Record<string, RegionCode> = {
  // Türkiye
  TR: 'tr-ist', CY: 'tr-ist', AZ: 'tr-ist', GE: 'tr-ist',
  // Europe (GDPR)
  DE: 'eu-fra', FR: 'eu-fra', NL: 'eu-fra', BE: 'eu-fra',
  AT: 'eu-fra', CH: 'eu-fra', IT: 'eu-fra', ES: 'eu-fra',
  PL: 'eu-fra', CZ: 'eu-fra', RO: 'eu-fra', GR: 'eu-fra',
  GB: 'eu-fra', IE: 'eu-fra', SE: 'eu-fra', NO: 'eu-fra',
  DK: 'eu-fra', FI: 'eu-fra', PT: 'eu-fra', UA: 'eu-fra',
  // US
  US: 'us-east', CA: 'us-east', MX: 'us-east',
  // APAC
  SG: 'apac-sin', JP: 'apac-sin', CN: 'apac-sin', KR: 'apac-sin',
  IN: 'apac-sin', ID: 'apac-sin', TH: 'apac-sin', VN: 'apac-sin',
  MY: 'apac-sin', PH: 'apac-sin', AU: 'apac-sin', NZ: 'apac-sin',
  HK: 'apac-sin', TW: 'apac-sin',
};

export interface GeoLocation {
  /** Ülke ISO 3166-1 alpha-2 (örn. "TR", "DE") */
  country?: string;
  /** Şehir */
  city?: string;
  /** Latitude */
  lat?: number;
  /** Longitude */
  lng?: number;
}

export interface RoutingDecision {
  region: RegionCode;
  reason:
    | 'tenant_pinned'
    | 'country_match'
    | 'geo_distance'
    | 'manual_override'
    | 'default'
    | 'failover';
  /** Distance (km) — sadece geo_distance durumunda */
  distanceKm?: number;
  /** Alternatif region'lar (sıralı, en yakından en uzağa) */
  alternatives: RegionCode[];
}

// ───────────────────────────────────────────────────────────
// HAVERSINE FORMULA
// ───────────────────────────────────────────────────────────

/**
 * İki koordinat arasındaki mesafe (km) — Haversine formula.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Dünya yarıçapı (km)
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ───────────────────────────────────────────────────────────
// ROUTER
// ───────────────────────────────────────────────────────────

export interface RouterOptions {
  /** Tenant'ın pin'lenmiş region'ı (varsa her zaman onu kullan) */
  tenantPinnedRegion?: RegionCode;
  /** Manuel override (X-Region header) */
  manualRegion?: RegionCode;
  /** Region'ların şu anki sağlık durumu */
  regionHealth?: Map<RegionCode, 'active' | 'degraded' | 'down' | 'maintenance'>;
  /** Sağlıklı region yoksa failover için yedek region */
  fallbackRegion?: RegionCode;
}

export class GeoRouter {
  /**
   * Kullanıcı için en uygun region'ı seç.
   */
  route(
    location: GeoLocation | null,
    options: RouterOptions = {},
  ): RoutingDecision {
    // 1. Tenant pin (en yüksek öncelik)
    if (options.tenantPinnedRegion) {
      return {
        region: options.tenantPinnedRegion,
        reason: 'tenant_pinned',
        alternatives: this.getAlternatives(options.tenantPinnedRegion, options.regionHealth),
      };
    }

    // 2. Manuel override
    if (options.manualRegion) {
      return {
        region: options.manualRegion,
        reason: 'manual_override',
        alternatives: this.getAlternatives(options.manualRegion, options.regionHealth),
      };
    }

    // 3. Ülke kodu eşleşmesi
    if (location?.country) {
      const countryRegion = COUNTRY_TO_REGION[location.country.toUpperCase()];
      if (countryRegion && this.isAvailable(countryRegion, options.regionHealth)) {
        return {
          region: countryRegion,
          reason: 'country_match',
          alternatives: this.getAlternatives(countryRegion, options.regionHealth),
        };
      }
    }

    // 4. Geo-distance (koordinat varsa)
    if (location?.lat !== undefined && location?.lng !== undefined) {
      const sorted = Object.values(REGIONS)
        .filter((r) => this.isAvailable(r.code, options.regionHealth))
        .map((r) => ({
          code: r.code,
          distance: haversineDistance(location.lat!, location.lng!, r.lat, r.lng),
        }))
        .sort((a, b) => a.distance - b.distance);

      if (sorted[0]) {
        return {
          region: sorted[0].code,
          reason: 'geo_distance',
          distanceKm: sorted[0].distance,
          alternatives: sorted.slice(1).map((s) => s.code),
        };
      }
    }

    // 5. Default region (TR) — fallback öncelikli
    if (options.fallbackRegion && this.isAvailable(options.fallbackRegion, options.regionHealth)) {
      return {
        region: options.fallbackRegion,
        reason: 'failover',
        alternatives: this.getAlternatives(options.fallbackRegion, options.regionHealth),
      };
    }
    const defaultRegion = this.isAvailable(DEFAULT_REGION, options.regionHealth)
      ? DEFAULT_REGION
      : this.selectFirstAvailable(options.regionHealth) ?? DEFAULT_REGION;
    return {
      region: defaultRegion,
      reason: 'default',
      alternatives: this.getAlternatives(defaultRegion, options.regionHealth),
    };
  }

  /**
   * İlk available region'ı seç (default region down ise).
   */
  private selectFirstAvailable(health?: Map<RegionCode, string>): RegionCode | null {
    const all = Object.values(REGIONS);
    const available = all.find((r) => this.isAvailable(r.code, health));
    return available?.code ?? null;
  }

  /**
   * Region müsait mi?
   */
  private isAvailable(
    code: RegionCode,
    health?: Map<RegionCode, string>,
  ): boolean {
    if (!health) return true;
    const status = health.get(code);
    return status !== 'down' && status !== 'maintenance';
  }

  /**
   * Alternatif region'lar (sağlıklı + en yakından).
   */
  private getAlternatives(
    primary: RegionCode,
    health?: Map<RegionCode, string>,
  ): RegionCode[] {
    return Object.values(REGIONS)
      .filter((r) => r.code !== primary && this.isAvailable(r.code, health))
      .map((r) => r.code);
  }
}

// ───────────────────────────────────────────────────────────
// CONVENIENCE: parseRequestHeaders
// ───────────────────────────────────────────────────────────

/**
 * Cloudflare/Vercel header'larından geo-location parse et.
 *
 * CF-IPCountry: "TR"
 * X-Vercel-IP-Country: "TR"
 * CF-IPCity: "Istanbul"
 * X-Vercel-IP-City: "Istanbul"
 * CF-iPLatitude / CF-IPLongitude: koordinatlar (nadir)
 */
export function parseGeoFromHeaders(headers: Record<string, string | undefined>): GeoLocation | null {
  const country =
    headers['cf-ipcountry'] ?? headers['x-vercel-ip-country'] ?? headers['x-geo-country'];
  const city =
    headers['cf-ipcity'] ?? headers['x-vercel-ip-city'] ?? headers['x-geo-city'];
  const latStr = headers['cf-iplatitude'] ?? headers['x-vercel-ip-latitude'];
  const lngStr = headers['cf-iplongitude'] ?? headers['x-vercel-ip-longitude'];

  if (!country && !city && !latStr && !lngStr) return null;

  return {
    country: country || undefined,
    city: city || undefined,
    lat: latStr ? parseFloat(latStr) : undefined,
    lng: lngStr ? parseFloat(lngStr) : undefined,
  };
}