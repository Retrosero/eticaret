/**
 * Modern tema — Footer bileşeni.
 *
 * 4 sütunlu grid, sürüm notu, sosyal bağlantı alanı.
 */

import Link from 'next/link';
import type { NavigationMenu, ResolvedTheme } from '@eticart/theme-engine';
import { footerVariantAttr } from '@eticart/theme-engine';

export function ModernFooter(props: {
  theme: ResolvedTheme;
  menu: NavigationMenu;
}): JSX.Element {
  const { theme, menu } = props;
  const variant = footerVariantAttr(theme);
  const columns: { title: string; items: NavigationMenu['items'] }[] = [
    { title: 'Kurumsal', items: menu.items.slice(0, 4) },
    { title: 'Alışveriş', items: menu.items.slice(4, 8) },
    { title: 'Yardım', items: menu.items.slice(8, 12) },
  ];
  const year = new Date().getFullYear();

  return (
    <footer className={`theme-modern-footer theme-footer theme-footer--${variant}`}>
      <div className="theme-container">
        <div className="theme-modern-footer__grid">
          <div className="theme-modern-footer__col">
            {theme.logoUrl ? (
              <img src={theme.logoUrl} alt="Mağaza logosu" style={{ maxHeight: 40, marginBottom: 16 }} />
            ) : (
              <h3 style={{ marginBottom: 16 }}>Mağaza</h3>
            )}
            <p className="theme-muted" style={{ fontSize: 14 }}>
              Türkçe e-ticaret deneyimi için modern arayüz.
            </p>
          </div>
          {columns.map((col, idx) => (
            <div key={idx} className="theme-modern-footer__col">
              <h3>{col.title}</h3>
              <ul>
                {col.items.map((it) => (
                  <li key={it.id}>
                    <Link href={it.href}>{it.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="theme-modern-footer__bottom">
          <span>© {year} EtiCart. Tüm hakları saklıdır.</span>
          <span>
            <Link href="/kvkk">KVKK</Link> · <Link href="/cerez-politikasi">Çerez Politikası</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}