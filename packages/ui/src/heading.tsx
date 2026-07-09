/**
 * Erişilebilir başlık bileşeni (semantik seviye).
 *
 * `level` (1-6) hem görsel hem de anlamsal seviyeyi belirler.
 */

import { createElement, type ReactNode, type HTMLAttributes } from 'react';

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
}

export function Heading({ level, children, ...rest }: HeadingProps) {
  const tag = `h${level}` as const;
  // 'h1'..'h6' türü için tip güvenli yol: createElement
  return createElement(tag, rest, children);
}
