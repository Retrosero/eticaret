/**
 * Storefront tema registry'si.
 *
 * Yeni tema eklemek iÃ§in switch/case deÄŸiÅŸtirmek yerine bir ThemeDefinition
 * kaydedilir. Tema manifesti backend'den gelse bile component kodu yalnÄ±zca
 * gÃ¼venilir, deploy edilmiÅŸ registry kayÄ±tlarÄ±ndan seÃ§ilir.
 */
import type { ReactNode } from 'react';
import type { NavigationMenu, ResolvedTheme } from '@eticart/theme-engine';
import { ModernHeader } from '../../themes/modern/Header';
import { ModernFooter } from '../../themes/modern/Footer';
import { ClassicHeader } from '../../themes/classic/Header';
import { ClassicFooter } from '../../themes/classic/Footer';
import { AtelierHeader } from '../../themes/atelier/Header';
import { AtelierFooter } from '../../themes/atelier/Footer';
import { TradeHeader } from '../../themes/trade/Header';
import { TradeFooter } from '../../themes/trade/Footer';
import { ProductCard as DefaultProductCard, type ProductCardProps } from './product-card';
import { ProductGallery as DefaultProductGallery, type ProductGalleryProps } from './product-gallery';
import { CategoryLayout as DefaultCategoryLayout, type CategoryLayoutProps } from './category-layout';

export interface ThemeHeaderProps {
  theme: ResolvedTheme;
  menu: NavigationMenu;
  cartItemCount?: number;
}

export interface ThemeFooterProps {
  theme: ResolvedTheme;
  menu: NavigationMenu;
}

export type ThemeProductCardProps = ProductCardProps;
export type ThemeProductGalleryProps = ProductGalleryProps;
export type ThemeCategoryLayoutProps = CategoryLayoutProps;

export interface ThemeDefinition {
  readonly id: string;
  readonly header: (props: ThemeHeaderProps) => JSX.Element;
  readonly footer: (props: ThemeFooterProps) => JSX.Element;
  readonly productCard: (props: ThemeProductCardProps) => JSX.Element;
  readonly productGallery: (props: ThemeProductGalleryProps) => JSX.Element;
  readonly categoryLayout: (props: ThemeCategoryLayoutProps) => JSX.Element;
}

const themeRegistry = new Map<string, ThemeDefinition>();

export function registerTheme(definition: ThemeDefinition): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(definition.id)) {
    throw new Error(`GeÃ§ersiz tema ID'si: ${definition.id}`);
  }
  if (themeRegistry.has(definition.id)) {
    throw new Error(`Tema zaten kayÄ±tlÄ±: ${definition.id}`);
  }
  themeRegistry.set(definition.id, definition);
}

export function getThemeDefinition(themeId: string): ThemeDefinition {
  return themeRegistry.get(themeId) ?? themeRegistry.get('modern')!;
}

export function listRegisteredThemes(): ReadonlyArray<string> {
  return Array.from(themeRegistry.keys());
}

registerTheme({ id: 'modern', header: ModernHeader, footer: ModernFooter, productCard: DefaultProductCard, productGallery: DefaultProductGallery, categoryLayout: DefaultCategoryLayout });
registerTheme({ id: 'classic', header: ClassicHeader, footer: ClassicFooter, productCard: DefaultProductCard, productGallery: DefaultProductGallery, categoryLayout: DefaultCategoryLayout });
registerTheme({ id: 'atelier', header: AtelierHeader, footer: AtelierFooter, productCard: DefaultProductCard, productGallery: DefaultProductGallery, categoryLayout: DefaultCategoryLayout });
registerTheme({ id: 'trade', header: TradeHeader, footer: TradeFooter, productCard: DefaultProductCard, productGallery: DefaultProductGallery, categoryLayout: DefaultCategoryLayout });

export function ThemeHeader(props: ThemeHeaderProps): ReactNode {
  const Header = getThemeDefinition(props.theme.manifest.id).header;
  return <Header theme={props.theme} menu={props.menu} cartItemCount={props.cartItemCount} />;
}

export function ThemeFooter(props: ThemeFooterProps): ReactNode {
  const Footer = getThemeDefinition(props.theme.manifest.id).footer;
  return <Footer theme={props.theme} menu={props.menu} />;
}

/** Tema class adÄ± (Ã¶rn. `theme-modern`). */
export function themeClass(themeId: string): string {
  return `theme-${themeId}`;
}

