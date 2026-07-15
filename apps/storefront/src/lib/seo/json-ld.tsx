/**
 * Schema.org JSON-LD component.
 *
 * Server component olarak çalışır; her sayfa ilgili schema'yı render eder.
 * Google Rich Results uyumlu (Product, Organization, BreadcrumbList, FAQ).
 */
import type { SchemaOrg } from './types';

interface JsonLdProps {
  data: SchemaOrg | SchemaOrg[];
  /** ID (aynı sayfada birden fazla schema varsa). */
  id?: string;
}

/**
 * JSON-LD script element.
 *
 * Kullanım:
 * ```tsx
 * <JsonLd data={productSchema} />
 * <JsonLd data={[organizationSchema, breadcrumbSchema]} id="combined" />
 * ```
 */
export function JsonLd({ data, id }: JsonLdProps): JSX.Element {
  const arr = Array.isArray(data) ? data : [data];
  const json = JSON.stringify(arr);

  return (
    <script
      type="application/ld+json"
      id={id}
      // Suppress hydration warning çünkü JSON.stringify escape karakterleri içerir
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

/**
 * Graph formatında JSON-LD (birden fazla entity @id ile bağlı).
 */
export function JsonLdGraph({
  nodes,
  id = 'seo-graph',
}: {
  nodes: Array<SchemaOrg & { '@id'?: string }>;
  id?: string;
}): JSX.Element {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': nodes,
  };
  return (
    <script
      type="application/ld+json"
      id={id}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
