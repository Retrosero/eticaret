/**
 * Schema.org schema factory fonksiyonları.
 *
 * Ürün, kategori, marka, breadcrumb, FAQ için type-safe schema üreticiler.
 */
import type {
  ArticleSchema,
  BreadcrumbListSchema,
  FAQPageSchema,
  OrganizationSchema,
  ProductSchema,
  WebSiteSchema,
} from './types';
import { siteConfig } from './site-config';

/**
 * Organization schema — site genelinde bir kez render edilir.
 */
export function organizationSchema(): OrganizationSchema {
  const sameAs = Object.values(siteConfig.social ?? {}).filter(Boolean) as string[];

  return {
    '@context': 'https://schema.org',
    '@type': siteConfig.organizationType ?? 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    logo: siteConfig.logo,
    description: siteConfig.description,
    sameAs,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+90-850-XXX-XXXX',
      contactType: 'customer service',
      areaServed: 'TR',
      availableLanguage: ['Turkish', 'English'],
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Istanbul',
      addressRegion: 'TR',
      addressCountry: 'TR',
    },
  };
}

/**
 * WebSite schema — SearchAction ile.
 */
export function websiteSchema(): WebSiteSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: 'tr-TR',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.url}/arama?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Product schema — ürün detay sayfası için.
 */
export interface ProductSchemaInput {
  id: string;
  name: string;
  description?: string;
  image?: string[];
  sku: string;
  gtin?: string;
  brandName: string;
  category?: string;
  url: string;
  price: number;
  currency: string;
  availability: 'in_stock' | 'out_of_stock' | 'pre_order' | 'back_order';
  condition?: 'new' | 'used' | 'refurbished';
  priceValidUntil?: string;
  ratingValue?: number;
  reviewCount?: number;
}

export function productSchema(input: ProductSchemaInput): ProductSchema {
  const availabilityMap: Record<ProductSchemaInput['availability'], string> = {
    in_stock: 'https://schema.org/InStock',
    out_of_stock: 'https://schema.org/OutOfStock',
    pre_order: 'https://schema.org/PreOrder',
    back_order: 'https://schema.org/BackOrder',
  };

  const conditionMap = {
    new: 'https://schema.org/NewCondition',
    used: 'https://schema.org/UsedCondition',
    refurbished: 'https://schema.org/RefurbishedCondition',
  } as const;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    image: input.image,
    sku: input.sku,
    gtin: input.gtin,
    brand: { '@type': 'Brand', name: input.brandName },
    category: input.category,
    offers: {
      '@type': 'Offer',
      url: input.url,
      price: input.price,
      priceCurrency: input.currency,
      availability: availabilityMap[input.availability] as ProductSchema['offers'] extends infer T
        ? T extends { availability: infer A }
          ? A
          : never
        : never,
      itemCondition: input.condition
        ? conditionMap[input.condition]
        : 'https://schema.org/NewCondition',
      priceValidUntil: input.priceValidUntil,
      seller: { '@type': 'Organization', name: siteConfig.name },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
        merchantReturnDays: 14,
        returnMethod: 'https://schema.org/ReturnByMail',
      },
    },
    ...(input.ratingValue && input.reviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating' as const,
            ratingValue: input.ratingValue,
            reviewCount: input.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/**
 * BreadcrumbList schema.
 */
export function breadcrumbSchema(items: Array<{ name: string; url: string }>): BreadcrumbListSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * FAQPage schema.
 */
export function faqSchema(faqs: Array<{ question: string; answer: string }>): FAQPageSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Article schema — blog yazıları için.
 */
export interface ArticleSchemaInput {
  title: string;
  description: string;
  image?: string[];
  url: string;
  publishedTime: string;
  modifiedTime?: string;
  authorName: string;
  authorUrl?: string;
  section?: string;
  keywords?: string[];
}

export function articleSchema(input: ArticleSchemaInput): ArticleSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    image: input.image,
    datePublished: input.publishedTime,
    dateModified: input.modifiedTime ?? input.publishedTime,
    author: {
      '@type': 'Person',
      name: input.authorName,
      url: input.authorUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      logo: { '@type': 'ImageObject', url: siteConfig.logo ?? `${siteConfig.url}/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    articleSection: input.section,
    keywords: input.keywords,
  };
}

/**
 * Collection page için ItemList schema (ürün listeleme).
 */
export interface ItemListInput {
  name: string;
  url: string;
  items: Array<{
    name: string;
    url: string;
    image?: string;
    position: number;
  }>;
}

export function itemListSchema(input: ItemListInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    url: input.url,
    itemListElement: input.items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      url: item.url,
      image: item.image,
    })),
  };
}
