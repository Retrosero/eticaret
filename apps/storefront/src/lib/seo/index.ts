/**
 * @eticart/storefront/seo — SEO optimization utilities.
 *
 * Modüller:
 *  - types          → Type definitions
 *  - site-config    → Site-wide configuration (env-driven)
 *  - metadata       → Next.js Metadata builder
 *  - schemas        → Schema.org JSON-LD factories
 *  - json-ld        → JSON-LD React component
 *  - sitemap        → XML Sitemap generator
 *  - robots         → robots.txt generator
 *
 * @example
 *   // app/page.tsx
 *   import { buildMetadata, JsonLd, organizationSchema, websiteSchema } from '@/lib/seo';
 *
 *   export const metadata = buildMetadata({
 *     title: 'Anasayfa',
 *     description: '...',
 *     type: 'website',
 *   });
 *
 *   export default function Home() {
 *     return (
 *       <>
 *         <JsonLd data={[organizationSchema(), websiteSchema()]} />
 *         ...
 *       </>
 *     );
 *   }
 */
export * from './types';
export * from './site-config';
export * from './metadata';
export * from './schemas';
export { JsonLd, JsonLdGraph } from './json-ld';
export * from './sitemap';
export * from './robots';
