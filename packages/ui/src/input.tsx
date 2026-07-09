/**
 * Erişilebilir input bileşeni.
 *
 * label, hata ve yardım metni için standardize slot'lar sunar.
 * Tüm native `<input>` props'larını destekler.
 */

import {
  forwardRef,
  useId,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  /** Sağ tarafta buton gibi ekstra içerik (örn: adres arama butonu). */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, trailing, id, className, style, ...rest },
  ref,
): ReactElement {
  const reactId = useId();
  const inputId = id ?? `eticart-input-${reactId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
    fontFamily: 'inherit',
    ...style,
  };

  const labelStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--theme-text, #111827)',
  };

  const fieldRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'stretch',
    gap: 8,
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: '10px 12px',
    fontSize: 14,
    lineHeight: '22px',
    border: '1px solid var(--theme-border, #d1d5db)',
    borderRadius: 6,
    background: 'var(--theme-surface, #fff)',
    color: 'var(--theme-text, #111827)',
    fontFamily: 'inherit',
    outline: 'none',
  };

  const helperStyle: CSSProperties = {
    fontSize: 12,
    color: error ? '#dc2626' : 'var(--theme-muted, #6b7280)',
  };

  return (
    <div style={containerStyle} className={className}>
      <label htmlFor={inputId} style={labelStyle}>
        {label}
      </label>
      <div style={fieldRowStyle}>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
          style={{
            ...inputStyle,
            ...(error ? { borderColor: '#dc2626' as const } : {}),
          }}
          {...rest}
        />
        {trailing}
      </div>
      {error ? (
        <span id={errorId} role="alert" style={helperStyle}>
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} style={helperStyle}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
