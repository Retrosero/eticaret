# @eticart/eslint-config

Türkçe e-ticaret SaaS platformu için paylaşılan ESLint yapılandırması.

## Kullanım

Bir uygulamanın veya paketin kökünde `eslint.config.js` oluşturun:

```js
// Node.js uygulamaları için
import config from '@eticart/eslint-config/node';
export default config;

// React bileşen kütüphaneleri için
import config from '@eticart/eslint-config/react';
export default config;

// Next.js App Router için
import config from '@eticart/eslint-config/next';
export default config;

// NestJS için
import config from '@eticart/eslint-config/nestjs';
export default config;
```

## Kurallar

- TypeScript strict modu ile uyumlu
- Prettier ile çakışma yok
- Erişilebilirlik (a11y) React bileşenlerinde zorunlu
- `any` kullanımı yasak
- Kullanılmayan değişkenler hata
- Türkçe hata mesajları ve loglar desteklenir
