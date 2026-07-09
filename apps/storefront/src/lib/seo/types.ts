/**
 * SEO tipleri — ortak sözleşme.
 *
 * Tüm SEO bileşenleri (meta tags, JSON-LD, sitemap, OG image generator)
 * bu tipleri kullanır.
 */

import type { Metadata } from 'next';

/** Site yapılandırması. */
export interface SiteConfig {
  name: string;
  shortName: string;
  description: string;
  url: string; // https://eticart.com.tr
  locale: 'tr_TR' | 'en_US';
  alternateLocale?: 'tr_TR' | 'en_US';
  /** Sosyal medya profilleri. */
  social?: {
    twitter?: string; // @eticart
    facebook?: string; // https://facebook.com/eticart
    instagram?: string;
    linkedin?: string;
    youtube?: string;
  };
  /** Google Search Console verification code. */
  googleSiteVerification?: string;
  /** Yandex verification code. */
  yandexVerification?: string;
  /** OG image default. */
  defaultOgImage?: string;
  /** Şirket logo (Schema.org Organization için). */
  logo?: string;
  /** Kuruluş tipi. */
  organizationType?: 'Organization' | 'Store' | 'OnlineStore';
}

/** Sayfa bazlı SEO meta veri. */
export interface PageSEO {
  title: string;
  description: string;
  /** Canonical URL path (örn. /urun/iphone-15). Boş bırakılırsa otomatik. */
  path?: string;
  /** OG image (sayfa için özel). */
  ogImage?: string;
  /** Sayfa tipi (Schema.org için). */
  type?: 'website' | 'article' | 'product' | 'profile' | 'book';
  /** Yayınlanma zamanı (article). */
  publishedTime?: string;
  /** Son güncellenme (article). */
  modifiedTime?: string;
  /** Yazar (article). */
  author?: string;
  /** Bölüm (article). */
  section?: string;
  /** Etiketler (article). */
  tags?: string[];
  /** Indexlenmesin (noindex). */
  noindex?: boolean;
  /** Takip etmesin (nofollow). */
  nofollow?: boolean;
  /** Hreflang alternatif URL'ler. */
  alternates?: {
    languages?: Record<string, string>;
  };
}

/** Schema.org yapısal veri (JSON-LD). */
export type SchemaOrg =
  | OrganizationSchema
  | WebSiteSchema
  | ProductSchema
  | BreadcrumbListSchema
  | FAQPageSchema
  | ArticleSchema
  | LocalBusinessSchema;

export interface OrganizationSchema {
  '@context': 'https://schema.org';
  '@type': 'Organization' | 'Store' | 'OnlineStore';
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
  contactPoint?: {
    '@type': 'ContactPoint';
    telephone: string;
    contactType: 'customer service' | 'sales' | 'support';
    areaServed?: string | string[];
    availableLanguage?: string | string[];
  };
  address?: {
    '@type': 'PostalAddress';
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
}

export interface WebSiteSchema {
  '@context': 'https://schema.org';
  '@type': 'WebSite';
  name: string;
  url: string;
  description?: string;
  inLanguage?: string;
  potentialAction?: {
    '@type': 'SearchAction';
    target: {
      '@type': 'EntryPoint';
      urlTemplate: string;
    };
    'query-input': string;
  };
}

export interface ProductSchema {
  '@context': 'https://schema.org';
  '@type': 'Product';
  name: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  gtin?: string; // Global Trade Item Number
  brand?: {
    '@type': 'Brand';
    name: string;
  };
  category?: string;
  offers?: ProductOffer | ProductOffer[];
  aggregateRating?: AggregateRating;
  review?: Review[];
}

export interface ProductOffer {
  '@type': 'Offer';
  url: string;
  price: number;
  priceCurrency: string;
  availability:
    | 'https://schema.org/InStock'
    | 'https://schema.org/OutOfStock'
    | 'https://schema.org/PreOrder'
    | 'https://schema.org/BackOrder'
    | 'https://schema.org/Discontinued';
  itemCondition?:
    | 'https://schema.org/NewCondition'
    | 'https://schema.org/UsedCondition'
    | 'https://schema.org/RefurbishedCondition';
  priceValidUntil?: string; // ISO 8601
  seller?: {
    '@type': 'Organization';
    name: string;
  };
  shippingDetails?: {
    '@type': 'OfferShippingDetails';
    shippingDestination?: { '@type': 'DefinedRegion'; addressCountry?: string };
    deliveryTime?: {
      '@type': 'ShippingDeliveryTime';
      handlingTime?: { '@type': 'QuantitativeValue'; minValue: number; maxValue: number };
      transitTime?: { '@type': 'QuantitativeValue'; minValue: number; maxValue: number };
    };
  };
  hasMerchantReturnPolicy?: {
    '@type': 'MerchantReturnPolicy';
    returnPolicyCategory: string;
    merchantReturnDays: number;
    returnMethod?: string;
    returnFees?: string;
  };
}

export interface AggregateRating {
  '@type': 'AggregateRating';
  ratingValue: number;
  reviewCount: number;
  bestRating?: number;
  worstRating?: number;
}

export interface Review {
  '@type': 'Review';
  author: { '@type': 'Person'; name: string };
  datePublished: string;
  reviewBody: string;
  reviewRating: {
    '@type': 'Rating';
    ratingValue: number;
    bestRating?: number;
  };
}

export interface BreadcrumbListSchema {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: BreadcrumbItem[];
}

export interface BreadcrumbItem {
  '@type': 'ListItem';
  position: number;
  name: string;
  item: string;
}

export interface FAQPageSchema {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: FAQItem[];
}

export interface FAQItem {
  '@type': 'Question';
  name: string;
  acceptedAnswer: {
    '@type': 'Answer';
    text: string;
  };
}

export interface ArticleSchema {
  '@context': 'https://schema.org';
  '@type': 'Article' | 'NewsArticle' | 'BlogPosting';
  headline: string;
  description?: string;
  image?: string | string[];
  datePublished: string;
  dateModified?: string;
  author?: {
    '@type': 'Person' | 'Organization';
    name: string;
    url?: string;
  };
  publisher?: {
    '@type': 'Organization';
    name: string;
    logo: { '@type': 'ImageObject'; url: string };
  };
  mainEntityOfPage?: { '@type': 'WebPage'; '@id': string };
  articleSection?: string;
  keywords?: string[];
}

export interface LocalBusinessSchema {
  '@context': 'https://schema.org';
  '@type': 'LocalBusiness' | 'Store';
  name: string;
  image?: string;
  address: {
    '@type': 'PostalAddress';
    streetAddress: string;
    addressLocality: string;
    addressRegion?: string;
    postalCode: string;
    addressCountry: string;
  };
  telephone?: string;
  email?: string;
  url?: string;
  openingHoursSpecification?: OpeningHoursSpecification[];
  priceRange?: string;
  aggregateRating?: AggregateRating;
}

export interface OpeningHoursSpecification {
  '@type': 'OpeningHoursSpecification';
  dayOfWeek: string[]; // Monday, Tuesday, ...
  opens: string; // HH:MM
  closes: string; // HH:MM
}

/** Next.js Metadata extension. */
export interface ExtendedMetadata extends Metadata {}