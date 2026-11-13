import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CURRENCY, formatAmount } from '../core';

/** A ruled section: hairline above, small caps title, optional action on the right. */
export function Section({
  title,
  action,
  span = 'span-6',
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  span?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section fade-in ${span} ${className}`}>
      {title || action ? (
        <header className="section-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Panel({ children, className = '', span = '' }: { children: ReactNode; className?: string; span?: string }) {
  return <div className={`panel ${span} ${className}`}>{children}</div>;
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that counts to its new value instead of snapping. Formatting is the caller's,
 * so the same component serves amounts, percentages and counts.
 */
export function Num({
  value,
  format = formatAmount,
  className = '',
  duration = 420,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduceMotion() || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let id = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) id = requestAnimationFrame(tick);
      else from.current = value;
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value, duration]);
  return <span className={`num money ${className}`}>{format(shown)}</span>;
}

export function Stat({ label, value, foot }: { label: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value num money">{value}</div>
      {foot ? <div className="foot">{foot}</div> : null}
    </div>
  );
}

/** A signed change with a direction arrow — the arrow carries meaning, not only the colour. */
export function Delta({
  value,
  suffix,
  invert = false,
  showUnit = true,
}: {
  value: number;
  suffix?: string;
  invert?: boolean;
  showUnit?: boolean;
}) {
  const flat = Math.abs(value) < 0.005;
  const up = value > 0;
  const good = invert ? !up : up;
  const cls = flat ? 'flat' : good ? 'up' : 'down';
  return (
    <span className={`delta ${cls} num money`}>
      <span aria-hidden>{flat ? '–' : up ? '↑' : '↓'}</span>
      {formatAmount(value)}
      {showUnit ? ` ${CURRENCY}` : ''}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}

export function DeltaPercent({ value, invert = false, label = 'vs prev.' }: { value: number | null; invert?: boolean; label?: string }) {
  if (value === null) return <span className="delta flat">new</span>;
  const flat = Math.abs(value) < 0.5;
  const up = value > 0;
  const good = invert ? !up : up;
  const cls = flat ? 'flat' : good ? 'up' : 'down';
  return (
    <span className={`delta ${cls} num`}>
      <span aria-hidden>{flat ? '–' : up ? '↑' : '↓'}</span>
      {Math.abs(Math.round(value))}% {label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} />;
}

export function Tag({ children, tone = '' }: { children: ReactNode; tone?: '' | 'pos' | 'neg' | 'accent' | 'fill' }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

/** A labelled proportional bar — the ranked-breakdown primitive. */
export function BarRow({
  label,
  value,
  share,
  color,
  meta,
  onClick,
}: {
  label: string;
  value: number;
  share: number;
  color: string;
  meta?: string;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }} role={onClick ? 'button' : undefined}>
      <div className="row-between" style={{ marginBottom: 5 }}>
        <span className="dot-row">
          <Swatch color={color} />
          <span className="truncate">{label}</span>
        </span>
        <span className="num money">{formatAmount(value)}</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(1.5, share * 100)}%`, background: color }} />
      </div>
      <div className="tiny faint" style={{ marginTop: 3 }}>
        {Math.round(share * 100)}%{meta ? ` · ${meta}` : ''}
      </div>
    </div>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.key} className="chip" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.key} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** A centred modal. Escape closes it, and a click on the backdrop does too. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="modal fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={wide ? { maxWidth: 820 } : undefined}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, children, grow = false, style }: { label: string; children: ReactNode; grow?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`field ${grow ? 'grow' : ''}`} style={style}>
      <label className="caption">{label}</label>
      {children}
    </div>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="neg small">{children}</div>;
}

/** Progress bar coloured by pace: calm by default, accent when close, red when over. */
export function Meter({ ratio, tone }: { ratio: number; tone?: 'ok' | 'warn' | 'over' }) {
  const t = tone ?? (ratio > 1 ? 'over' : ratio > 0.85 ? 'warn' : 'ok');
  const color = t === 'over' ? 'var(--neg)' : t === 'warn' ? 'var(--accent)' : 'var(--ink)';
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(1.5, ratio * 100))}%`, background: color }} />
    </div>
  );
}
