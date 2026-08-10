import type { ReactNode } from 'react';
import { formatAmount } from './format';

export function Card({
  title,
  action,
  span = 'span-6',
  children,
}: {
  title?: string;
  action?: ReactNode;
  span?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card fade-in ${span}`}>
      {title || action ? (
        <header className="card-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  foot,
}: {
  label: string;
  value: string;
  foot?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {foot ? <div className="foot">{foot}</div> : null}
    </div>
  );
}

/**
 * A signed change with a direction arrow.
 *
 * The arrow carries the direction, so meaning never rests on colour alone.
 */
export function Delta({
  value,
  suffix,
  invert = false,
}: {
  value: number;
  suffix?: string;
  invert?: boolean;
}) {
  const flat = Math.abs(value) < 0.005;
  const up = value > 0;
  const good = invert ? !up : up;
  const cls = flat ? 'flat' : good ? 'up' : 'down';

  return (
    <span className={`delta ${cls} num`}>
      <span aria-hidden>{flat ? '–' : up ? '↑' : '↓'}</span>
      {formatAmount(value)}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}

export function DeltaPercent({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="delta flat">new</span>;
  const flat = Math.abs(value) < 0.5;
  const up = value > 0;
  const good = invert ? !up : up;
  const cls = flat ? 'flat' : good ? 'up' : 'down';
  return (
    <span className={`delta ${cls} num`}>
      <span aria-hidden>{flat ? '–' : up ? '↑' : '↓'}</span>
      {Math.abs(Math.round(value))}% vs previous
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} />;
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
    <div
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      role={onClick ? 'button' : undefined}
    >
      <div className="row-between" style={{ marginBottom: 6 }}>
        <span className="dot-row">
          <Swatch color={color} />
          <span className="truncate">{label}</span>
        </span>
        <span className="num">{formatAmount(value)}</span>
      </div>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ width: `${Math.max(1.5, share * 100)}%`, background: color }}
        />
      </div>
      <div className="caption" style={{ marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>
        {Math.round(share * 100)}%{meta ? ` · ${meta}` : ''}
      </div>
    </div>
  );
}
