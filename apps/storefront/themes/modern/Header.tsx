/**
 * Modern tema — Header bileşeni.
 *
 * Mega menü destekli, sticky, responsive. Tenant override edilen logo,
 * menü öğeleri ve renkler ile çalışır.
 */

import Link from 'next/link';
import type { NavigationMenu, ResolvedTheme } from '@eticart/theme-engine';
import { headerVariantAttr } from '@eticart/theme-engine';

export function ModernHeader(props: {
  theme: ResolvedTheme;
  menu: NavigationMenu;
  cartItemCount?: number;
}): JSX.Element {
  const { theme, menu, cartItemCount = 0 } = props;
  const variant = headerVariantAttr(theme);
  return (
    <header className={`theme-modern-header theme-header theme-header--${variant}`}>
      <div className="theme-container">
        <div className="theme-modern-header__top">
          <Link href="/" className="theme-modern-header__logo" aria-label="Anasayfa">
            {theme.logoUrl ? (
              <img src={theme.logoUrl} alt="Mağaza logosu" />
            ) : (
              <span className="theme-modern-header__logo-fallback">Mağaza</span>
            )}
          </Link>

          <nav className="theme-modern-header__nav" aria-label="Ana menü">
            {menu.items.map((item) => (
              <div key={item.id} className="theme-modern-header__nav-item">
                <Link href={item.href} className="theme-modern-header__nav-link">
                  {item.label}
                </Link>
                {item.children.length > 0 && variant === 'mega-menu' && (
                  <div className="theme-modern-header__submenu">
                    {item.children.map((child) => (
                      <Link key={child.id} href={child.href} className="theme-modern-header__submenu-link">
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="theme-modern-header__actions">
            <Link href="/arama" className="theme-btn theme-btn-secondary" aria-label="Ara">
              Ara
            </Link>
            <Link href="/sepet" className="theme-btn theme-btn-secondary" aria-label="Sepetim">
              Sepet ({cartItemCount})
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}