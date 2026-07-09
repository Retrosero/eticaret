# Faz 19 — White-Label (Custom Branding)

**Tarih:** 2026-07-07
**Süre:** ~3 saat
**Durum:** ✅ Tamamlandı

---

## 1. Hedef

Her tenant'ın kendi **marka kimliği** ile mağazasını çalıştırabilmesi:
- Özel logo (light + dark)
- Favicon
- Marka renkleri (9 renk)
- Font ailesi
- Border radius
- Email template branding
- Sosyal medya linkleri
- İletişim bilgileri
- Özel CSS (advanced)
- Custom domain (CNAME + TXT doğrulama)

---

## 2. Mimari

```
┌────────────────────────────────────────────────────────────────┐
│  Tenant Admin UI (apps/tenant-admin/branding)                  │
│  - Live preview                                                  │
│  - Renk seçici (color picker)                                    │
│  - Logo URL / upload                                             │
│  - Font, radius, email, social, contact                        │
└────────────────────┬───────────────────────────────────────────┘
                     │ PATCH /branding
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  commerce-backend (BrandingService)                            │
│  - DB: tenant_settings.branding (JSONB)                         │
│  - Hex color validation                                          │
│  - Custom domain DNS doğrulama (CNAME + TXT)                    │
│  - CSS variable generation                                       │
└────────────────────┬───────────────────────────────────────────┘
                     │ GET /branding/css
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  Storefront (apps/storefront/lib/branding.ts)                  │
│  - getTenantBranding() (server-side)                           │
│  - brandingToCss() (CSS variables)                              │
│  - brandingToMetadata() (favicon)                                │
│  - Layout'ta inline <style> inject                              │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Branding API

### 3.1 Get Branding

```http
GET /branding
Authorization: Bearer <token>

→ 200 OK
{
  "brandName": "Yıldız Tekstil",
  "logoUrl": "https://cdn.eticart.com.tr/yildiz/logo.png",
  "logoDarkUrl": "https://cdn.eticart.com.tr/yildiz/logo-dark.png",
  "faviconUrl": "https://cdn.eticart.com.tr/yildiz/favicon.ico",
  "colors": {
    "primary": "#dc2626",
    "primaryForeground": "#ffffff",
    "secondary": "#6b7280",
    "accent": "#f59e0b",
    "background": "#ffffff",
    "surface": "#fef2f2",
    "text": "#1c1c1c",
    "textMuted": "#6b7280",
    "border": "#e5e7eb"
  },
  "font": {
    "family": "Inter, sans-serif",
    "headingFamily": "Playfair Display, serif"
  },
  "radius": "md",
  "email": {
    "fromName": "Yıldız Tekstil",
    "replyTo": "info@yildiztekstil.com",
    "footerText": "© 2026 Yıldız Tekstil",
    "logoUrl": "...",
    "accentColor": "#dc2626"
  },
  "social": {
    "instagram": "yildiztekstil",
    "facebook": "yildiztekstil"
  },
  "contact": {
    "phone": "+90 532 123 4567",
    "email": "info@yildiztekstil.com",
    "whatsapp": "+90 532 123 4567",
    "address": "İstanbul, Türkiye"
  },
  "customCss": "...",
  "updatedAt": "2026-07-07T10:00:00.000Z"
}
```

### 3.2 Update Branding (Partial)

```http
PATCH /branding
{
  "brandName": "Yıldız Tekstil",
  "colors": {
    "primary": "#dc2626"
  }
}

→ 200 OK
{ ... tam branding objesi ... }
```

**Validation:**
- Hex color: `#RGB` veya `#RRGGBB` veya `#RRGGBBAA`
- Radius: `none | sm | md | lg | xl | full`
- customCss: max 10.000 karakter
- Email fromName: max 100 karakter
- Tüm URL'ler: geçerli URL olmalı

### 3.3 CSS Variables Endpoint

```http
GET /branding/css

→ 200 OK
Content-Type: text/css
Cache-Control: public, max-age=300

:root{
  --eticart-color-primary: #dc2626;
  --eticart-color-primary-foreground: #ffffff;
  --eticart-color-secondary: #6b7280;
  --eticart-color-accent: #f59e0b;
  --eticart-color-background: #ffffff;
  --eticart-color-surface: #fef2f2;
  --eticart-color-text: #1c1c1c;
  --eticart-color-text-muted: #6b7280;
  --eticart-color-border: #e5e7eb;
  --eticart-font-family: Inter, sans-serif;
  --eticart-font-heading: Playfair Display, serif;
  --eticart-radius: 0.5rem;
}
```

### 3.4 Custom Domain Doğrulama

```http
POST /branding/domain/verify
{ "domain": "magaza.example.com" }

→ 200 OK
{
  "verified": true,
  "cnameOk": true,
  "txtOk": true,
  "message": "Domain başarıyla doğrulandı."
}
```

**Doğrulama Adımları:**
1. CNAME: `magaza.example.com → eticart.com.tr` veya `*.eticart.com.tr`
2. TXT: `_eticart-verify.magaza.example.com → eticart-verify-<tenantId>`

---

## 4. Storefront Branding Injection

`apps/storefront/src/app/layout.tsx`:

```typescript
export default async function RootLayout({ children }) {
  const branding = await getTenantBranding();
  return (
    <html>
      <body>
        <style dangerouslySetInnerHTML={{ __html: `:root{${brandingToCss(branding)}}${branding.customCss ?? ''}` }} />
        {children}
      </body>
    </html>
  );
}
```

**Subdomain → Branding:**
- `demo.eticart.com.tr` → demo tenant'ın branding
- `www.eticart.com.tr` → default branding
- Custom domain (Faz 20) → custom domain mapping

---

## 5. Branding Admin UI

`apps/tenant-admin/src/app/branding/`

**Özellikler:**
- **Live preview** — renk/logo değişiklikleri anında görünür
- **Color picker** — her renk için hex input + native color picker
- **9 renk** (primary, primaryForeground, secondary, accent, background, surface, text, textMuted, border)
- **Logo URL** (light + dark)
- **Favicon URL**
- **Font ailesi** (body + heading)
- **Border radius** (6 seçenek)
- **Email template ayarları** (fromName, replyTo, footer)
- **Sosyal medya** (Instagram, Twitter, Facebook, YouTube, LinkedIn, TikTok)
- **İletişim** (phone, email, whatsapp, address)
- **Custom CSS** (advanced textarea)
- **Sticky save button**

---

## 6. Mimari Kararlar

### 6.1 CSS Variable Tabanlı
- `--eticart-color-*` ve `--eticart-font-*` değişkenleri
- Tüm component'ler `var(--eticart-color-primary)` kullanır
- Runtime tema değişikliği (yeniden yükleme gerekmez)
- CSS specificity sorunlarına yol açmaz

### 6.2 Server-Side Resolve
- Tenant branding per-request resolve (subdomain'ten)
- Edge cache (Cache-Control: public, max-age=300)
- Build time'da değil, runtime'da (per-tenant)

### 6.3 JSONB Storage
- `tenant_settings.branding` (PostgreSQL JSONB)
- Schema evolution kolaylığı (yeni alan ekle = migration yok)
- Postgres'in native JSONB query desteği (GIN index)

### 6.4 Color Validation
- Strict hex regex (3, 6 veya 8 hex karakter)
- Server-side validation (Zod + service level)
- UI'da native color picker ile UX

### 6.5 Default Branding
- Hiç ayar yapılmamışsa Eticart default branding
- Default'lar her yerde mevcut (graceful degradation)

### 6.6 Custom Domain DNS
- CNAME: app routing (Caddy handle eder)
- TXT: ownership verification (security)
- İki adım: önce CNAME (yönlendirme), sonra TXT (doğrulama)

---

## 7. Test Sonuçları

### Yeni Testler (13)

| Test | Sayı | Sonuç |
|------|------|-------|
| `branding.service.test.ts` | 13 | ✅ |

**Kapsam:**
- getBranding (default + kayıtlı)
- updateBranding (partial, color validation, radius, customCss, color merge)
- getCssVariables (CSS variable string)
- verifyCustomDomain (DNS API signature)
- DEFAULT_BRANDING (tüm alanlar, hex format)

### Tüm Proje Test Özeti

| Paket | Test | Sonuç |
|------|------|-------|
| commerce-backend | **180** | ✅ (+13) |
| plugin-sdk | 19 | ✅ |
| control-plane | 63 | ✅ |
| storefront | 59 | ✅ |
| storage-adapter | 35 | ✅ |
| notification-adapters | 34 | ✅ |
| einvoice-adapters | 13 | ✅ |
| payment-adapters | 51 | ✅ |
| shipping-adapters | 39 | ✅ |
| **TOPLAM** | **493+** ✅ | **+13 yeni** |

---

## 8. Dosya Yapısı (Faz 19)

```
apps/commerce-backend/src/modules/branding/    # 🆕
├── branding.service.ts                        # 8.5 KB (default, validation, DNS)
├── branding.controller.ts                     # 6.3 KB (5 endpoint)
├── branding.module.ts
└── __tests__/branding.service.test.ts         # 13 test

apps/storefront/src/lib/branding.ts            # 🆕 Tenant branding (server-side)

apps/storefront/src/app/layout.tsx             # ✏️ Branding inject (CSS variables)

apps/tenant-admin/src/app/branding/            # 🆕 Branding admin UI
├── page.tsx                                   # Server component
└── BrandingClient.tsx                         # 12.9 KB (color picker, preview, form)
```

---

## 9. Production Checklist

- [x] Hex color validation
- [x] CSS variable injection
- [x] Default branding (graceful degradation)
- [x] Cache-Control (5 dakika)
- [x] Zod schema validation
- [x] Radius enum validation
- [x] Custom CSS length limit
- [x] Email validation
- [x] URL validation
- [ ] Custom domain: Caddy wildcard SSL (Sprint 15'te var)
- [ ] Custom domain: per-domain SSL cert (Caddy)
- [ ] Email template white-label (Faz 19.5)
- [ ] Logo upload (S3/R2, Sprint 19.5)

---

## 10. White-Label Sınırlamalar

| Plan | Custom Domain | Custom Logo | Custom CSS | Email Branding |
|------|---------------|-------------|------------|----------------|
| Starter | ❌ | ✅ | ❌ | ✅ |
| Growth | ✅ | ✅ | ✅ | ✅ |
| Pro | ✅ | ✅ | ✅ | ✅ |
| Enterprise | ✅ | ✅ | ✅ | ✅ |

---

## 11. Sprint 20+ Önerileri

| Sprint | İçerik | Süre |
|--------|--------|------|
| **19.5** | Custom domain: per-tenant SSL + DNS automation | 3 gün |
| **20** | Analytics & reporting dashboard | 5 gün |
| **21** | Help center / ticket sistemi | 3-5 gün |
| **22** | Super admin SSO + RBAC | 3 gün |
| **23** | Plugin sandboxing + versioning | 5 gün |

---

*Son güncelleme: 2026-07-07 — Faz 19 White-Label*
*Toplam: 41+ Faz, 493+ test*