/**
 * Tenant Residency — Tenant verisinin hangi region'da saklanacağı.
 *
 * KVKK (Türkiye) ve GDPR (EU) uyumu: Tenant verisi
 * belirli bir region'da kalmalı. Cross-region migration
 * yalnız tenant talebi + audit log ile yapılabilir.
 */
import type { RegionCode } from './region.js';

export type ComplianceFramework = 'kvkk' | 'gdpr' | 'ccpa' | 'pdpa' | 'none';

export interface TenantResidency {
  tenantId: string;
  /** Pin'lenmiş region (birincil) */
  primaryRegion: RegionCode;
  /** Yedek region (DR — felaket kurtarma için read-only) */
  backupRegion?: RegionCode;
  /** Tenant'ın uyumluluk çerçevesi */
  compliance: ComplianceFramework;
  /** Tenant ülke/bölge */
  country?: string;
  /** Veri işleme izni var mı (tenant onayı)? */
  dataProcessingConsent: boolean;
  /** Audit trail */
  migrationHistory: ResidencyMigration[];
}

export interface ResidencyMigration {
  from: RegionCode;
  to: RegionCode;
  reason: string;
  /** İşlemi yapan (super admin email) */
  performedBy: string;
  /** Onaylı mı? */
  approved: boolean;
  timestamp: string;
}

/**
 * Compliance framework → zorunlu region mapping.
 */
export const COMPLIANCE_REGION_MAP: Record<ComplianceFramework, RegionCode[]> = {
  kvkk: ['tr-ist'],           // Türkiye'de kalmalı
  gdpr: ['eu-fra', 'tr-ist'], // EU veya Türkiye
  ccpa: ['us-east', 'eu-fra'],
  pdpa: ['apac-sin'],
  none: ['tr-ist', 'eu-fra', 'us-east', 'apac-sin'],
};

/**
 * Compliance için uygun region öner.
 */
export function suggestRegionForCompliance(
  compliance: ComplianceFramework,
  preferred?: RegionCode,
): RegionCode | null {
  const allowed = COMPLIANCE_REGION_MAP[compliance];
  if (preferred && allowed.includes(preferred)) return preferred;
  return allowed[0] ?? null;
}

/**
 * Tenant residency validator.
 */
export class TenantResidencyManager {
  /**
   * Tenant için residency oluştur.
   */
  create(
    tenantId: string,
    country: string | undefined,
    compliance: ComplianceFramework,
    preferredRegion?: RegionCode,
  ): TenantResidency {
    const region =
      preferredRegion ??
      suggestRegionForCompliance(compliance) ??
      'tr-ist';

    return {
      tenantId,
      primaryRegion: region,
      backupRegion: this.suggestBackup(region),
      compliance,
      country,
      dataProcessingConsent: false,
      migrationHistory: [],
    };
  }

  /**
   * Yedek region öner.
   */
  private suggestBackup(primary: RegionCode): RegionCode | undefined {
    const map: Record<RegionCode, RegionCode> = {
      'tr-ist': 'eu-fra',
      'eu-fra': 'tr-ist',
      'us-east': 'eu-fra',
      'apac-sin': 'us-east',
    };
    return map[primary];
  }

  /**
   * Tenant'ı farklı region'a migrate et.
   */
  migrate(
    residency: TenantResidency,
    toRegion: RegionCode,
    performedBy: string,
    reason: string,
  ): TenantResidency {
    // Compliance kontrol
    const allowed = COMPLIANCE_REGION_MAP[residency.compliance];
    if (!allowed.includes(toRegion)) {
      throw new Error(
        `Region ${toRegion} bu compliance (${residency.compliance}) için uygun değil. ` +
          `İzin verilen: ${allowed.join(', ')}`,
      );
    }

    const migration: ResidencyMigration = {
      from: residency.primaryRegion,
      to: toRegion,
      reason,
      performedBy,
      approved: true,
      timestamp: new Date().toISOString(),
    };

    return {
      ...residency,
      primaryRegion: toRegion,
      backupRegion: residency.primaryRegion,
      migrationHistory: [...residency.migrationHistory, migration],
    };
  }

  /**
   * Tenant verisini KVKK/GDPR kapsamında mı?
   */
  requiresDataResidency(compliance: ComplianceFramework): boolean {
    return compliance === 'kvkk' || compliance === 'gdpr';
  }

  /**
   * Audit rapor — tenant migration geçmişi.
   */
  getAuditReport(residency: TenantResidency): {
    tenantId: string;
    currentRegion: RegionCode;
    compliance: ComplianceFramework;
    totalMigrations: number;
    lastMigration?: ResidencyMigration;
  } {
    return {
      tenantId: residency.tenantId,
      currentRegion: residency.primaryRegion,
      compliance: residency.compliance,
      totalMigrations: residency.migrationHistory.length,
      lastMigration: residency.migrationHistory[residency.migrationHistory.length - 1],
    };
  }
}