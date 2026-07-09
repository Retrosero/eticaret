/**
 * Erişilebilir button bileşeni.
 *
 * - `variant`: primary | secondary | ghost | danger — görsel tonu belirler
 * - `size`: sm | md | lg — boyut
 * - `fullWidth`: tüm satırı kapla
 * - `loading`: beklerken spinner gösterir ve disabled yapar
 *
 * Standart `<button>` props'larını destekler (type, disabled, onClick vb.).
 */

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}

function variantStyles(variant: ButtonVariant): CSSProperties {
  switch (variant) {
    case 'primary':
      return { background: 'var(--theme-primary, #111827)', color: '#fff', border: '1px solid var(--theme-primary, #111827)' };
    case 'secondary':
      return { background: 'var(--theme-surface, #fff)', color: 'var(--theme-text, #111827)', border: '1px solid var(--theme-border, #d1d5db)' };
    case 'ghost':
      return { background: 'transparent', color: 'var(--theme-text, #111827)', border: '1px solid transparent' };
    case 'danger':
      return { background: '#dc2626', color: '#fff', border: '1px solid #dc2626' };
    default:
      return {};
  }
}

function sizeStyles(size: ButtonSize): CSSProperties {
  switch (size) {
    case 'sm':
      return { padding: '6px 12px', fontSize: 13, lineHeight: '20px' };
    case 'md':
      return { padding: '10px 16px', fontSize: 14, lineHeight: '22px' };
    case 'lg':
      return { padding: '14px 24px', fontSize: 16, lineHeight: '24px' };
    default:
      return {};
  }
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    disabled,
    children,
    style,
    type = 'button',
    ...rest
  },
  ref,
): ReactElement {
  const isDisabled = disabled === true || loading;
  const computedStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 6,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.6 : 1,
    fontWeight: 600,
    transition: 'opacity 150ms ease, transform 100ms ease',
    width: fullWidth ? '100%' : undefined,
    fontFamily: 'inherit',
    ...variantStyles(variant),
    ...sizeStyles(size),
    ...style,
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={computedStyle}
      {...rest}
    >
      {loading ? <span aria-hidden="true">⏳</span> : null}
      {children}
    </button>
  );
});
