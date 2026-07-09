/**
 * Bayi (dealer) güvenlik bağlamı.
 *
 * Bu yardımcı, bayi tarafından erişilen tüm sorgularda CompanyAccount
 * izolasyonunu garanti eder. B2B sorgulamalarında her çağrıda
 * `companyAccountId` zorunlu olarak filtreye eklenir.
 *
 * Kullanım:
 *   const ctx = await resolveDealerContext(prisma, { userId, companyAccountId? });
 *   // ctx.companyAccountId her zaman bir UUID olur (yetkisiz erişim reddedilir)
 */

import type { PrismaClient } from '@prisma/client';
import type { Uuid } from '@eticart/shared-types';

/** Dealer (bayi) güvenlik bağlamı — tüm B2B sorgularda zorunlu. */
export interface DealerContext {
  /** Aktif tenant ID. */
  tenantId: Uuid;
  /** Kullanıcı (auth user) ID. */
  userId: Uuid;
  /** Bayi firma hesabı ID — her sorguya uygulanır. */
  companyAccountId: Uuid;
  /** Bayi içi rol (ör. dealer_admin). */
  dealerRole: string;
  /** Tenant üst yönetici mi (super/tenant_admin)? Onay/override için kullanılır. */
  isTenantAdmin: boolean;
}

/** Bayi sorgu izolasyonu için prisma sorgu şablonu. */
export interface DealerScopedQuery {
  tenantId: Uuid;
  companyAccountId: Uuid;
}

/**
 * Verilen kullanıcının dealer bağlamını çözer. Kullanıcı birden fazla
 * CompanyAccount'a bağlıysa, açıkça bir `companyAccountId` geçilmelidir;
 * aksi halde hata fırlatılır (cross-bayi sızıntısını önlemek için).
 *
 * @param prisma Prisma client (tenant-scoped).
 * @param opts   userId ve opsiyonel companyAccountId.
 */
export async function resolveDealerContext(
  prisma: PrismaClient,
  opts: { userId: Uuid; companyAccountId?: Uuid | null; tenantAdminBypass?: boolean },
): Promise<DealerContext> {
  const { userId, companyAccountId, tenantAdminBypass } = opts;

  // tenant_admin veya super_admin ise bypass (örn. bayi başvuru listesi)
  if (tenantAdminBypass) {
    // Tenant ID'yi user'dan çekmemiz gerekir; burada user tablosuna bağımlılık var
    // (auth paketi). Basitleştirmek için: caller bu yolu sadece dahili context'lerde kullanır.
    // Implementasyon detayı: caller ek bir tenantId parametresi geçmeli.
    throw new Error(
      'resolveDealerContext: tenantAdminBypass için tenantId gerekir. resolveDealerContextAsAdmin kullanın.',
    );
  }

  // Kullanıcı tüm DealerUser kayıtlarını çek
  const dealerUsers = await prisma.dealerUser.findMany({
    where: { authUserId: userId, isActive: true },
    select: {
      id: true,
      tenantId: true,
      companyAccountId: true,
      role: true,
    },
  });

  if (dealerUsers.length === 0) {
    throw new Error('BAYI_BAGLANTISI_YOK');
  }

  // Birden fazla firma bağlantısı varsa ve explicit companyAccountId yoksa hata
  if (dealerUsers.length > 1 && !companyAccountId) {
    throw new Error('COKLU_FIRMA_SECIM_GEREKLI');
  }

  const firstUser = dealerUsers[0];
  if (!firstUser) {
    throw new Error('BAYI_BAGLANTISI_YOK');
  }
  let target = firstUser;
  if (companyAccountId) {
    const match = dealerUsers.find((d) => d.companyAccountId === companyAccountId);
    if (!match) {
      // Cross-bayi erişim girişimi — reddet
      throw new Error('BAYI_YETKISI_YOK');
    }
    target = match;
  }

  return {
    tenantId: target.tenantId as Uuid,
    userId,
    companyAccountId: target.companyAccountId as Uuid,
    dealerRole: target.role,
    isTenantAdmin: false,
  };
}

/**
 * Tenant admin için dealer bağlamı (bayiye özel sorgulama yapabilir,
 * companyAccountId geçilir; yoksa filtre uygulanmaz).
 */
export function resolveDealerContextAsAdmin(tenantId: Uuid, userId: Uuid): DealerContext {
  return {
    tenantId,
    userId,
    companyAccountId: '' as Uuid, // tenant admin tüm firmaları görebilir; sorgu fonksiyonları isAdmin'e göre filtreyi kaldırır
    dealerRole: 'tenant_admin',
    isTenantAdmin: true,
  };
}

/** Standart bayi sorgu kapsamı (tenant + companyAccount) filtresi. */
export function dealerScope(ctx: DealerContext): DealerScopedQuery {
  return { tenantId: ctx.tenantId, companyAccountId: ctx.companyAccountId };
}
