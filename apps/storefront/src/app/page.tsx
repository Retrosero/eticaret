/**
 * Root storefront route.
 *
 * Ana sayfa catch-all tema akışıyla aynı render zincirini kullanır. Böylece
 * `/` statik/demo sayfasını değil, tenant'ın aktif temasını gösterir.
 */
import type { ReactNode } from 'react';

import TenantLayout from './[...slug]/layout';
import ThemeHomePage, { generateMetadata } from './[...slug]/page';

export { generateMetadata };

export default function RootStorefrontPage(): ReactNode {
  return (
    <TenantLayout>
      <ThemeHomePage />
    </TenantLayout>
  );
}
