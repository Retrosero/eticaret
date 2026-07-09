/**
 * `@Public()` dekoratörü — JWT guard devre dışı bırakır.
 *
 * Login, refresh, sağlık kontrolü gibi uçlarda kullanılır.
 */

import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'auth:public';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_KEY, true);