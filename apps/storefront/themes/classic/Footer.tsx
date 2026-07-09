/**
 * Klasik tema — Footer bileşeni.
 *
 * 3 sütunlu, klasik çerçeveli.
 */

import Link from 'next/link';
import type { NavigationMenu, ResolvedTheme } from '@eticart/theme-engine';
import { footerVariantAttr } from '@eticart/theme-engine';

export function ClassicFooter(props: {
  theme: ResolvedTheme;
  menu: NavigationMenu;
}): JSX.Element {
  const { theme, menu } = props;
  const variant = footerVariantAttr(theme);
  const year = new Date().getFullYear();

  return (
    <footer className={`theme-classic-footer theme-footer theme-footer--${variant}`}>
      <div className="theme-container">
        <div className="theme-classic-footer__grid">
          <div className="theme-classic-footer__col">
            {theme.logoUrl ? (
              <img src={theme.logoUrl} alt="Mağaza logosu" style={{ maxHeight: 36, marginBottom: 12 }} />
            ) : (
              <h3 style={{ marginBottom: 12 }}>Mağaza</h3>
            )}
            <p className="theme-muted" style={{ fontSize: 13 }}>
              Geleneksel Türkçe e-ticaret deneyimi.
            </p>
          </div>
          <div className="theme-classic-footer__col">
            <h3>Bağlantılar</h3>
            <ul>
              {menu.items.slice(0, 6).map((it) => (
                <li key={it.id}>
                  <Link href={it.href}>{it.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="theme-classic-footer__col">
            <h3>İletişim</h3>
            <ul>
              <li><Link href="/iletisim">İletişim</Link></li>
              <li><Link href="/sss">Sık Sorulan Sorular</Link></li>
              <li><Link href="/kvkk">KVKK</Link></li>
            </ul>
          </div>
        </div>
        <div className="theme-classic-footer__bottom">
          <span>© {year} EtiCart.</span>
          <span><Link href="/cerez-politikasi">Çerez Politikası</Link></span>
        </div>
      </div>
    </footer>
  );
}