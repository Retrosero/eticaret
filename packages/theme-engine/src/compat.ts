/**
 * Faz 1 geriye uyumluluğu — eski `ThemeTokens` tipi korunur.
 */

import type { DesignTokenValues } from './types/index.js';

/** Eski tip adı — yeni kod `DesignTokenValues` kullanmalı. */
export type HexColor = `#${string}`;

/** Eski tema token haritası. */
export interface ThemeTokens {
  primary: HexColor;
  onPrimary: HexColor;
  background: HexColor;
  surface: HexColor;
  text: HexColor;
  textMuted: HexColor;
  border: HexColor;
  fontFamily: string;
  radius: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

/** Faz 1'deki default tema. */
export const defaultThemes: Readonly<Record<string, DesignTokenValues>> = {
  default: {
    'color.primary': '#1f6feb',
    'color.on-primary': '#ffffff',
    'color.background': '#ffffff',
    'color.surface': '#f6f8fa',
    'color.text': '#1c1c1c',
    'color.text-muted': '#5e5e5e',
    'color.border': '#d0d7de',
    'font.body': 'Inter, system-ui, -apple-system, sans-serif',
    'radius.base': '6px',
  },
};