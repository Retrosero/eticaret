/**
 * Region Router Middleware — Her istek için bölge seçimi.
 *
 * Sıralama:
 * 1. X-Region header (manual override)
 * 2. CF-IPCountry (Cloudflare) → country → region mapping
 * 3. Geo-distance (CF-IPLatitude / CF-IPLongitude)
 * 4. Default region (tr-ist)
 *
 * Request'e `region` bilgisi eklenir (req.region).
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import {
  GeoRouter,
  parseGeoFromHeaders,
  FailoverManager,
  type RegionCode,
} from '@eticart/region-router';

declare module 'express-serve-static-core' {
  interface Request {
    region?: RegionCode;
    regionReason?: string;
  }
}

@Injectable()
export class RegionMiddleware implements NestMiddleware {
  private router: GeoRouter;
  private failover: FailoverManager;

  constructor() {
    this.router = new GeoRouter();
    this.failover = new FailoverManager();
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const headers: Record<string, string | undefined> = {
      'cf-ipcountry': req.headers['cf-ipcountry'] as string | undefined,
      'cf-ipcity': req.headers['cf-ipcity'] as string | undefined,
      'x-vercel-ip-country': req.headers['x-vercel-ip-country'] as string | undefined,
      'cf-iplatitude': req.headers['cf-iplatitude'] as string | undefined,
      'cf-iplongitude': req.headers['cf-iplongitude'] as string | undefined,
      'x-region': req.headers['x-region'] as string | undefined,
    };

    const geo = parseGeoFromHeaders(headers);
    const manualRegion = headers['x-region'] as RegionCode | undefined;

    const decision = this.router.route(geo, {
      manualRegion,
      regionHealth: this.failover.getHealth(),
    });

    req.region = decision.region;
    req.regionReason = decision.reason;

    // Response header — debug için
    res.setHeader('X-Served-By-Region', decision.region);
    res.setHeader('X-Region-Reason', decision.reason);

    next();
  }

  getFailoverManager(): FailoverManager {
    return this.failover;
  }
}