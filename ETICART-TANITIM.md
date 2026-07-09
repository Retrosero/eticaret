# EtiCart — Türkiye'nin Modern E-Ticaret SaaS Platformu

> **Eticart**, KOBİ'lerden kurumsal şirketlere, Türkiye'nin mevzuatına ve iş yapış biçimine göre **sıfırdan tasarlanmış**, **çok kiracılı (multi-tenant)**, **KVKK uyumlu**, **açık kaynak mimariye sahip** bir e-ticaret SaaS platformudur. Global yazılımların "Türkçe'ye çevrilmiş" yaklaşımının aksine, gerçek bir Türk e-ticaret operasyonunun tüm ihtiyaçlarını **doğal olarak** karşılar.

---

## 🎯 Problem ve Çözüm

### Geleneksel e-ticaret platformlarının sınırları

| Sorun | Sonuç |
|------|------|
| Global yazılımların Türkçe'ye uyarlanması | Eksik mevzuat desteği, çeviri hataları |
| KVKK uyumunun müşteriye bırakılması | Hukuki risk, ceza tehdidi |
| e-Fatura, e-İrsaliye'nin 3. parti entegrasyonu | Ek maliyet, kırılgan entegrasyon |
| B2B ve B2C için ayrı platform | Operasyonel karmaşıklık |
| Eklenti yığını mimarisi | Performans düşüklüğü, bakım zorluğu |
| Black-box lisans modeli | Vendor lock-in, yüksek maliyet |

### EtiCart'ın yaklaşımı

- **Türkçe doğal** — Türk e-ticaretinin gerçek ihtiyaçlarına göre tasarlandı
- **Mevzuata uyumlu** — KVKK, GİB, e-Fatura, e-İrsaliye, e-Arşiv yerleşik
- **Tek platform** — B2C, B2B, bayi yönetimi, kurumsal fatura
- **Temiz mimari** — Vendor lock-in yok, açık kaynak standartlar
- **Self-hostable** — Kendi sunucunuzda, tam KVKK kontrolü sizde

---

## 🏗️ Teknik Mimari

### Üç katmanlı modern stack

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND  —  Next.js 15 App Router                          │
│  ├─ Storefront      Müşteri vitrin (B2C + B2B)              │
│  └─ Tenant-Admin    Yönetim paneli (role-based)              │
└──────────────────────────────────────────────────────────────┘
                          ↕  REST API + OpenAPI
┌──────────────────────────────────────────────────────────────┐
│  BACKEND  —  NestJS + 80+ Prisma modeli                      │
│  ├─ Order / Cart / Checkout / Invoice                        │
│  ├─ Customer / Auth / KVKK / 2FA                             │
│  ├─ B2B: Quote / Credit / Approval / Pricing                 │
│  ├─ Notification (E-posta: SMTP + Resend)                    │
│  ├─ Audit (Güvenlik olay kaydı, webhook alert)               │
│  ├─ Storage (S3 / R2 / MinIO — multi-tenant)                 │
│  └─ Rate Limit + CSRF + Security Headers                     │
└──────────────────────────────────────────────────────────────┘
                          ↕
┌──────────────────────────────────────────────────────────────┐
│  ALTYAPI                                                     │
│  PostgreSQL 16 · Redis 7 · S3/R2 · SMTP · BullMQ            │
│  Coolify (self-hosted PaaS) · Docker Compose · CI/CD         │
└──────────────────────────────────────────────────────────────┘
```

### Veri katmanı: 80+ Prisma modeli

- **Ürün & PIM** — Ürün, varyant, kategori (recursive tree), marka, medya
- **Sipariş & Ödeme** — Sepet, checkout, sipariş, ödeme (iyzico/PayTR/Param)
- **Kargo & Teslimat** — Yurtiçi, Aras, MNG, Sürat, manuel
- **Müşteri & KVKK** — Profil, adres defteri, veri dışa aktarım, silme
- **B2B** — Bayi başvuru, onay iş akışı, kredi limiti, fiyat override
- **Fatura** — e-Fatura, e-Arşiv, e-İrsaliye (NES entegrasyonu)
- **Güvenlik** — Refresh token revocation, UserTwoFactor (TOTP), AuditLog
- **Bildirim** — Otomatik e-posta olayları, kuyruk yönetimi

---

## ✨ Tamamlanan Özellikler (40 Faz)

### 🛍️ 1. Mağaza & Vitrin
- ✅ Ürün, varyant, kategori (recursive tree), marka yönetimi
- ✅ Çoklu görsel, slug, SKU composite unique (tenant-bazlı)
- ✅ Stok takibi, fiyat listeleri (B2B override), vergi kuralları
- ✅ Sepet, checkout, ödeme (iyzico, PayTR, Param)
- ✅ Kargo (Yurtiçi, Aras, MNG, Sürat, Manuel)
- ✅ Sipariş durum makinesi (14 state, ALLOWED_TRANSITIONS doğrulamalı)
- ✅ Arama, filtreleme, sıralama
- ✅ KVKK uyumlu çerez banner'ı

### 🏢 2. B2B & Bayi Yönetimi
- ✅ Bayi başvuru → admin onay iş akışı (multi-step ApprovalWorkflow)
- ✅ Kredi limiti, bakiye, hareket geçmişi
- ✅ Fiyat override (şirket bazlı), ödeme vadesi
- ✅ Hızlı sipariş template, bayi sepeti (wholesale)
- ✅ Satış temsilcisi atama, bayi şubeleri
- ✅ B2B özel teklif (quote) yönetimi
- ✅ Toplu sipariş onay mekanizması

### 💰 3. Fatura & Mali
- ✅ **NES e-Fatura adaptörü** (`api.nes.com.tr`, OAuth2 Bearer, JSON)
- ✅ UBL 2.1 XML builder (e-fatura, e-arşiv, e-irsaliye)
- ✅ Otomatik fatura oluşturma (sipariş tamamlanınca)
- ✅ Fatura iptal, GİB durum sorgulama, PDF indirme
- ✅ Para **decimal(15,4)** kesinlik, para birimi cache
- ✅ iyzico / PayTR / Param ödeme adaptörleri

### 🔐 4. Kimlik & Yetki
- ✅ JWT (HS256 + jose), tenant claim'li token
- ✅ Refresh token rotation + revocation list (güvenli)
- ✅ **2FA / TOTP** (Google Authenticator uyumlu, RFC 6238)
- ✅ Yedek kodlar (8 adet, tek kullanımlık)
- ✅ Role-based access control (customer, tenant_admin, dealer_buyer, dealer_manager, sales_rep)
- ✅ Multi-tenant izolasyonu (cross-tenant koruması katmanlı)

### 🛡️ 5. KVKK Uyumu (Built-in)
- ✅ Müşteri veri dışa aktarımı (JSON + CSV)
- ✅ Veri silme (anonymization)
- ✅ Açık rıza (consent) kayıt defteri
- ✅ Audit log (kim neye erişti, ne zaman) — **DB-backed**
- ✅ **Critical severity → webhook alert** (Sentry / Datadog / Slack)
- ✅ Tenant-bazlı veri izolasyonu

### 📦 6. Storage (Multi-tenant)
- ✅ **AWS S3 / Cloudflare R2 / MinIO** destekli
- ✅ KVKK uyumlu AB bölgesi (R2 Frankfurt)
- ✅ Multi-tenant bucket prefix routing (`tenants/<uuid>/...`)
- ✅ Path traversal koruması (sanitize)
- ✅ Presigned PUT/GET URL (istemci doğrudan yükleme)
- ✅ Sıfır egress ücreti (R2 ile)

### 📧 7. Bildirimler
- ✅ **SMTP** (Nodemailer, lazy dynamic import)
- ✅ **Resend.com** (modern HTTP API)
- ✅ Handlebars-benzeri Türkçe şablon motoru (XSS güvenli)
- ✅ 4 hazır şablon: sipariş onayı, durum değişikliği, bayi onayı, KVKK veri hazır
- ✅ BullMQ kuyruk (retry + exponential backoff)
- ✅ InMemoryQueue (test/dev)

### 🛡️ 8. Production Hardening (OWASP Top 10)
- ✅ **Rate limiting** — 3 katman (10/s, 100/dk, 1000/saat)
- ✅ **CSRF koruması** — double-submit cookie + HMAC-signed nonce
- ✅ **Helmet** — CSP, HSTS, X-Frame-Options, COOP, Referrer-Policy
- ✅ HTTP Parameter Pollution (HPP) koruması
- ✅ Audit log (30+ olay tipi: login, CSRF, rate limit, cross-tenant)
- ✅ Sıkılaştırılmış CORS whitelist
- ✅ 30+ test ile doğrulanmış güvenlik

### 🚀 9. DevOps & Deployment
- ✅ **Coolify** self-hosted PaaS (Docker Compose)
- ✅ 7 servis production-ready: postgres, redis, backend, migrate, storefront, admin, minio
- ✅ GitHub Actions CI (typecheck + test + build + e2e)
- ✅ Playwright smoke (15 spec — storefront + admin)
- ✅ Vitest E2E backend (19 test — auth, security, multi-tenant, health)
- ✅ Sağlık kontrolü (`/health`, `/ready`)
- ✅ Otomatik Prisma migration (startup'ta)
- ✅ Backup stratejisi dokümante

---

## 📊 Kalite Metrikleri

| Metrik | Değer |
|--------|-------|
| **Toplam test** | **385+** (hepsi yeşil) |
| **Tip hata** | **0** |
| **Prisma model** | 80+ |
| **Kod kalitesi** | TypeScript strict mode, ESLint |
| **Güvenlik** | OWASP Top 10 uyumlu |
| **Dokümantasyon** | 14 Faz raporu + DEPLOYMENT.md + API docs (Swagger) |
| **API endpoint** | 80+ REST endpoint |
| **Frontend sayfa** | 22 (11 storefront + 11 admin) |

---

## 💼 Hedef Müşteriler

### KOBİ'ler (B2C)
- Hızlı mağaza açmak isteyen
- Teknik bilgisi olmayan (UI odaklı yönetim)
- KVKK uyumu için Türk yazılım tercih eden
- Bütçe dostu (global SaaS'lere göre %70 daha ekonomik)

### Toptancılar / Distribütörler (B2B)
- Bayi ağı yöneten
- Kredi limitli satış yapan
- Bayi başvuru/onay mekanizması gerektiren
- Fiyat override, özel ödeme vadesi ihtiyacı olan

### Markalar
- Çoklu kanal satış (kendi site + pazar yerleri)
- KVKK uyumlu veri depolama (self-hosted seçenek)
- ERP / muhasebe entegrasyonu
- Beyaz etiket (white-label) ihtiyacı

### Kurumsal
- Entegrasyon (SAP, Logo, Mikro vb.) ihtiyacı
- Yüksek hacim (yüzbinlerce ürün, milyonlarca sipariş)
- Compliance (KVKK, ISO 27001, SOC 2)
- Dedicated destek

---

## 💰 Fiyatlandırma Modeli

### Açık kaynak self-hosted
- **Ücretsiz** — Kendi sunucunuza kurun
- Topluluk desteği (GitHub Discussions)
- Tüm temel özellikler dahil
- KVKK tam kontrolü sizde

### Bulut SaaS (yakında)
| Plan | Aylık | Mağaza Sayısı | Özellikler |
|------|-------|---------------|------------|
| **Başlangıç** | ₺999 | 1 mağaza | Temel B2C, 5GB storage |
| **Profesyonel** | ₺2.999 | 1 mağaza | + B2B, 50GB storage, öncelikli destek |
| **Kurumsal** | Teklif | Sınırsız | + Beyaz etiket, SLA, dedicated destek |

*Global SaaS muadilleri (Shopify Plus, BigCommerce Enterprise) yıllık $50K-$500K arası. EtiCart %70-80 daha ekonomik.*

---

## 🎯 Neden EtiCart?

### 1. Yerel ihtiyaçlara göre tasarlandı
- Türk Lirası, KDV, e-Fatura, e-İrsaliye — tümü doğal destek
- iyzico, PayTR, Param entegrasyonu hazır
- Yurtiçi, Aras, MNG, Sürat kargo desteği
- KVKK, GİB, EPDK mevzuatına uyum

### 2. Açık mimari, vendor lock-in yok
- Tüm kod açık (MIT lisansı)
- Standart teknolojiler (TypeScript, React, NestJS, Prisma)
- Kendi sunucunuzda çalıştırın
- Fork'layın, özelleştirin

### 3. Modern teknoloji
- Next.js 15 (React Server Components)
- NestJS 10 (enterprise-grade backend)
- PostgreSQL 16 (ACID, JSONB, partitioning)
- Prisma ORM (type-safe queries)
- Redis 7 (cache + queue)

### 4. Production-ready güvenlik
- OWASP Top 10 uyumlu
- 2FA (TOTP), CSRF, rate limiting
- Audit log + webhook alerts (Sentry/Datadog/Slack)
- Refresh token rotation
- KVKK uyumlu veri silme

### 5. Operasyonel mükemmellik
- 380+ test (unit + integration + E2E)
- CI/CD pipeline (GitHub Actions)
- Otomatik migration
- Backup & disaster recovery
- Comprehensive monitoring

---

## 📦 Çözüm Kapsamı

### Faz 12 ile %100 tamamlanma (mevcut sprint)
**Hedef:** Var olan hiçbir özelliğe ekleme yapmadan, kalan 6 işi bitirmek.

1. ✅ DB-backed audit log (Prisma modeli)
2. ✅ Sentry/Datadog/Slack webhook alert
3. ✅ 2FA / TOTP (admin kullanıcılar)
4. ✅ Refresh token rotation + revocation list
5. ⏳ Tam DB-bağımlı E2E testleri (docker-compose.test)
6. ⏳ Final doğrulama + Faz 12 raporu

**Sonuç:** Production-ready, KVKK uyumlu, multi-tenant SaaS — %100 tamamlanma.

---

## 📞 İletişim

- **Web:** [eticart.com.tr](https://eticart.com.tr)
- **E-posta:** hello@eticart.com.tr
- **GitHub:** [github.com/eticart](https://github.com/eticart)
- **Demo:** [demo.eticart.com.tr](https://demo.eticart.com.tr)
- **Dokümantasyon:** [docs.eticart.com.tr](https://docs.eticart.com.tr)

---

## 📄 Lisans

MIT Lisansı — Özgürce kullanın, değiştirin, dağıtın. Detay için [LICENSE](./LICENSE) dosyasına bakın.

---

*Son güncelleme: Temmuz 2026 — Sprint 12 (%99.5 tamamlanma)*
*Test sayısı: 385+ | Tip hata: 0 | Prisma model: 80+ | Faz: 40*