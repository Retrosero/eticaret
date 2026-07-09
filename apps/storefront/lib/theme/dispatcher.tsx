/**
 * Storefront — tema dispatcher.
 *
 * Aktif tema ID'sine göre uygun header/footer bileşenlerini seçer.
 * Yeni bir tema eklemek için tek yapılacak: buraya bir case eklemek.
 */

import type { ReactNode } from 'react';
import type { NavigationMenu, ResolvedTheme } from '@eticart/theme-engine';
import { ModernHeader } from '../../themes/modern/Header.js';
import { ModernFooter } from '../../themes/modern/Footer.js';
import { ClassicHeader } from '../../themes/classic/Header.js';
import { ClassicFooter } from '../../themes/classic/Footer.js';

export function ThemeHeader(props: {
  theme: ResolvedTheme;
  menu: NavigationMenu;
  cartItemCount?: number;
}): ReactNode {
  switch (props.theme.manifest.id) {
    case 'modern':
      return <ModernHeader theme={props.theme} menu={props.menu} cartItemCount={props.cartItemCount} />;
    case 'classic':
      return <ClassicHeader theme={props.theme} menu={props.menu} cartItemCount={props.cartItemCount} />;
    default:
      return <ModernHeader theme={props.theme} menu={props.menu} cartItemCount={props.cartItemCount} />;
  }
}

export function ThemeFooter(props: {
  theme: ResolvedTheme;
  menu: NavigationMenu;
}): ReactNode {
  switch (props.theme.manifest.id) {
    case 'modern':
      return <ModernFooter theme={props.theme} menu={props.menu} />;
    case 'classic':
      return <ClassicFooter theme={props.theme} menu={props.menu} />;
    default:
      return <ModernFooter theme={props.theme} menu={props.menu} />;
  }
}

/** Tema class adı (örn. "theme-modern"). */
export function themeClass(themeId: string): string {
  return `theme-${themeId}`;
}