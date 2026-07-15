import type { ReactNode } from 'react';
import type { StorefrontBrand, StorefrontCategory } from '@eticart/storefront-sdk';

export interface CategoryLayoutProps {
  variant: 'sidebar-filter' | 'top-filter';
  themeClass: string;
  categories: ReadonlyArray<StorefrontCategory>;
  brands: ReadonlyArray<StorefrontBrand>;
  children: ReactNode;
}

function flattenCategories(categories: ReadonlyArray<StorefrontCategory>): StorefrontCategory[] {
  const result: StorefrontCategory[] = [];
  for (const category of categories) {
    result.push(category);
    result.push(...flattenCategories(category.children));
  }
  return result;
}

/** Kategori sayfası shell'i; tema bazında sidebar/top-filter değişebilir. */
export function CategoryLayout({ variant, themeClass, categories, brands, children }: CategoryLayoutProps): JSX.Element {
  const flatCategories = flattenCategories(categories);
  return (
    <div className={`${themeClass}-category-page theme-category-page theme-category-page--${variant}`}>
      {variant === 'sidebar-filter' && (
        <aside className="theme-category-page__sidebar" aria-label="Filtre">
          <div className="theme-category-page__filter-group">
            <h3>Kategoriler</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {flatCategories.map((category) => <li key={category.id} style={{ marginBottom: 8 }}><a href={`/kategori/${category.slug}`}>{category.name}</a></li>)}
            </ul>
          </div>
          <div className="theme-category-page__filter-group">
            <h3>Markalar</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {brands.map((brand) => <li key={brand.id} style={{ marginBottom: 8 }}><a href={`/marka/${brand.slug}`}>{brand.name}</a></li>)}
            </ul>
          </div>
        </aside>
      )}
      <div className="theme-category-page__main">
        {variant === 'top-filter' && (
          <div className="theme-category-page__top-filter">
            <span className="theme-muted">Sırala:</span>
            <select aria-label="Sıralama" className="theme-select">
              <option value="newest">En Yeni</option>
              <option value="price-asc">Fiyat: Düşükten Yükseğe</option>
              <option value="price-desc">Fiyat: Yüksekten Düşüğe</option>
              <option value="popular">Popüler</option>
            </select>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
