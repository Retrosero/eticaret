/**
 * Region Router — unit tests.
 */
import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  GeoRouter,
  parseGeoFromHeaders,
  REGIONS,
} from '../src/index.js';

describe('Haversine Distance', () => {
  it('İstanbul ↔ Ankara ≈ 350 km', () => {
    const distance = haversineDistance(41.0082, 28.9784, 39.9334, 32.8597);
    expect(distance).toBeGreaterThan(300);
    expect(distance).toBeLessThan(400);
  });

  it('aynı nokta → 0', () => {
    expect(haversineDistance(41, 29, 41, 29)).toBeCloseTo(0, 1);
  });

  it('İstanbul ↔ New York ≈ 8000 km', () => {
    const distance = haversineDistance(41.0082, 28.9784, 40.7128, -74.006);
    expect(distance).toBeGreaterThan(7500);
    expect(distance).toBeLessThan(8500);
  });
});

describe('GeoRouter', () => {
  const router = new GeoRouter();

  describe('route()', () => {
    it('tenant pin en yüksek öncelik', () => {
      const decision = router.route({ country: 'TR' }, { tenantPinnedRegion: 'eu-fra' });
      expect(decision.region).toBe('eu-fra');
      expect(decision.reason).toBe('tenant_pinned');
    });

    it('manuel override', () => {
      const decision = router.route({ country: 'TR' }, { manualRegion: 'us-east' });
      expect(decision.region).toBe('us-east');
      expect(decision.reason).toBe('manual_override');
    });

    it('Türkiye → tr-ist (country match)', () => {
      const decision = router.route({ country: 'TR' });
      expect(decision.region).toBe('tr-ist');
      expect(decision.reason).toBe('country_match');
    });

    it('Almanya → eu-fra', () => {
      const decision = router.route({ country: 'DE' });
      expect(decision.region).toBe('eu-fra');
    });

    it('ABD → us-east', () => {
      const decision = router.route({ country: 'US' });
      expect(decision.region).toBe('us-east');
    });

    it('Japonya → apac-sin', () => {
      const decision = router.route({ country: 'JP' });
      expect(decision.region).toBe('apac-sin');
    });

    it('geo distance: İstanbul koordinatları → tr-ist', () => {
      const decision = router.route({
        country: 'XX', // Bilinmeyen ülke
        lat: 41.0082,
        lng: 28.9784,
      });
      expect(decision.region).toBe('tr-ist');
      expect(decision.reason).toBe('geo_distance');
      expect(decision.distanceKm).toBeLessThan(50); // Çok yakın
    });

    it('geo distance: New York → us-east', () => {
      const decision = router.route({
        country: 'XX',
        lat: 40.7128,
        lng: -74.006,
      });
      expect(decision.region).toBe('us-east');
    });

    it('down region atlanır', () => {
      const health = new Map<string, 'active' | 'degraded' | 'down' | 'maintenance'>([
        ['tr-ist', 'down'],
        ['eu-fra', 'down'],
      ]);
      const decision = router.route({ country: 'TR' }, { regionHealth: health });
      expect(decision.region).not.toBe('tr-ist');
      expect(['us-east', 'apac-sin']).toContain(decision.region);
    });

    it('location null → default region', () => {
      const decision = router.route(null);
      expect(decision.region).toBe('tr-ist');
      expect(decision.reason).toBe('default');
    });

    it('alternatives listesi döner', () => {
      const decision = router.route({ country: 'TR' });
      expect(decision.alternatives).toContain('eu-fra');
      expect(decision.alternatives).not.toContain('tr-ist');
    });

    it('failover region override', () => {
      const decision = router.route(null, { fallbackRegion: 'us-east' });
      expect(decision.region).toBe('us-east');
      expect(decision.reason).toBe('failover');
    });
  });
});

describe('parseGeoFromHeaders', () => {
  it('Cloudflare header parse', () => {
    const headers = {
      'cf-ipcountry': 'TR',
      'cf-ipcity': 'Istanbul',
    };
    const geo = parseGeoFromHeaders(headers);
    expect(geo?.country).toBe('TR');
    expect(geo?.city).toBe('Istanbul');
  });

  it('Vercel header parse', () => {
    const headers = {
      'x-vercel-ip-country': 'DE',
      'x-vercel-ip-city': 'Berlin',
    };
    const geo = parseGeoFromHeaders(headers);
    expect(geo?.country).toBe('DE');
  });

  it('koordinat parse', () => {
    const headers = {
      'cf-iplatitude': '41.0082',
      'cf-iplongitude': '28.9784',
    };
    const geo = parseGeoFromHeaders(headers);
    expect(geo?.lat).toBeCloseTo(41.0082);
    expect(geo?.lng).toBeCloseTo(28.9784);
  });

  it('boş headers → null', () => {
    expect(parseGeoFromHeaders({})).toBeNull();
  });
});

describe('REGIONS', () => {
  it('4 region tanımlı', () => {
    expect(Object.keys(REGIONS)).toHaveLength(4);
  });

  it('her region\'ın gerekli alanları var', () => {
    for (const region of Object.values(REGIONS)) {
      expect(region.code).toBeDefined();
      expect(region.name).toBeDefined();
      expect(region.dbPrimary).toMatch(/^postgres:/);
      expect(region.redisUrl).toMatch(/^redis:/);
      expect(typeof region.lat).toBe('number');
      expect(typeof region.lng).toBe('number');
      expect(typeof region.dataResidencyRequired).toBe('boolean');
    }
  });

  it('TR region KVKK zorunlu', () => {
    expect(REGIONS['tr-ist'].dataResidencyRequired).toBe(true);
    expect(REGIONS['tr-ist'].regulatory).toContain('KVKK');
  });

  it('EU region GDPR zorunlu', () => {
    expect(REGIONS['eu-fra'].dataResidencyRequired).toBe(true);
    expect(REGIONS['eu-fra'].regulatory).toContain('GDPR');
  });
});