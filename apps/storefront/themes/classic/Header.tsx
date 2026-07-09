/**
 * Klasik tema — Header bileşeni.
 *
 * Klasik navbar, sade, küçük logo, üst-alt ayrımı net.
 */

import Link from 'next/link';
import type { NavigationMenu, ResolvedTheme } from '@eticart/theme-engine';
import { headerVariantAttr } from '@eticart/theme-engine';

export function ClassicHeader(props: {
  theme: ResolvedTheme;
  menu: NavigationMenu;
  cartItemCount?: number;
}): JSX.Element {
  const { theme, menu, cartItemCount = 0 } = props;
  const variant = headerVariantAttr(theme);
  return (
    <header className={`theme-classic-header theme-header theme-header--${variant}`}>
      <div className="theme-container">
        <div className="theme-classic-header__top">
          <Link href="/" className="theme-classic-header__logo" aria-label="Anasayfa">
            {theme.logoUrl ? (
              <img src={theme.logoUrl} alt="Mağaza logosu" />
            ) : (
              <span className="theme-classic-header__logo-fallback">Mağaza</span>
            )}
          </Link>

          <nav className="theme-classic-header__nav" aria-label="Ana menü">
            {menu.items.map((item) => (
              <Link key={item.id} href={item.href} className="theme-classic-header__nav-link">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="theme-classic-header__actions">
            <Link href="/arama" className="theme-btn theme-btn-secondary">Ara</Link>
            <Link href="/sepet" className="theme-btn theme-btn-secondary">Sepet ({cartItemCount})</Link>
          </div>
        </div>
      </div>
    </header>
  );
}