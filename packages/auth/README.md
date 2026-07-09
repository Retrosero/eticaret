# @eticart/auth

Kimlik doğrulama yardımcıları. **Faz 3'te** tamamlanacak.

Şu anda yalnızca:

- JWT claim tipleri (payload imzaları)
- Rol-tenant eşleme tip güvenliği
- `passwordHash` için önerilen argón2/kemik yapılandırması (Faz 3'te implement edilir)

## Yol haritası

- `apps/control-plane` üzerinden OAuth + e-posta/şifre
- Storefront için müşteri oturumu
- Tenant-admin panelleri için mağaza içi RBAC
