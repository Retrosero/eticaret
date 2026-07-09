/**
 * Sade kart bileşeni.
 *
 * - `padding`: false → padding kaldırılır (örn: media kartlarda)
 * - `elevation`: 'flat' | 'shadow' | 'bordered'
 * - Standart `<div>` props'larını destekler
 */

import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

export type CardElevation = 'flat' | 'shadow' | 'bordered';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: boolean;
  elevation?: CardElevation;
  children: ReactNode;
}

function elevationStyle(elevation: CardElevation): CSSProperties {
  switch (elevation) {
    case 'flat':
      return { border: 'none', boxShadow: 'none' };
    case 'shadow':
      return {
        border: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      };
    case 'bordered':
    default:
      return {
        border: '1px solid var(--theme-border, #e5e7eb)',
        boxShadow: 'none',
      };
  }
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = true, elevation = 'bordered', children, style, ...rest },
  ref,
): ReactElement {
  const computed: CSSProperties = {
    background: 'var(--theme-surface, #fff)',
    borderRadius: 10,
    padding: padding ? 20 : 0,
    overflow: 'hidden',
    ...elevationStyle(elevation),
    ...style,
  };

  return (
    <div ref={ref} style={computed} {...rest}>
      {children}
    </div>
  );
});
