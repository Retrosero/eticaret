# @eticart/payment-adapters

Ödeme adaptörleri. **Faz 6'da** tamamlanacak.

Planlanan adaptörler:
- `@eticart/payment-iyzico` (Türkiye)
- `@eticart/payment-paytr` (Türkiye)
- `@eticart/payment-param` (Türkiye)
- `@eticart/payment-stripe` (uluslararası, ihtiyaç halinde)

Her adaptör:
- Tenant başına API anahtarı yapılandırması
- 3D Secure yönlendirmesi
- Webhook imza doğrulama
- İade / kısmi iade
- KVKK uyumlu loglama

Şimdilik sadece **arayüz** tanımlanmıştır.
