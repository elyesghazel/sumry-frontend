import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatAmount } from './format';
import { cssVar, useStore } from './store';

/**
 * Chart primitives.
 *
 * Marks are thin, grids and axes recessive, and every plot ships a hover layer — a chart
 * you can't interrogate is a picture. Values are never printed on every point; the
 * tooltip carries the detail and the axis carries the orientation.
 */

/** Re-reads CSS custom properties whenever the theme flips. */
function useTokens() {
  const { theme } = useStore();
  const [tokens, setTokens] = useState(() => read());

  function read() {
    return {
      text: cssVar('--text') || '#eceef1',
      muted: cssVar('--text-muted') || '#9aa1ac',
      faint: cssVar('--text-faint') || '#646b76',
      grid: cssVar('--grid') || 'rgba(255,255,255,0.07)',
      accent: cssVar('--accent') || '#4a97e1',
      positive: cssVar('--positive') || '#7fbfa0',
      negative: cssVar('--negative') || '#e08d82',
    };
  }

  useEffect(() => {
    // The data-theme attribute is applied in an effect, so read on the next frame.
    const id = requestAnimationFrame(() => setTokens(read()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  return tokens;
}

const axisProps = (faint: string) => ({
  stroke: faint,
  tickLine: false,
  axisLine: false,
  tick: { fill: faint, fontSize: 11 },
});

function TipContent({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <div className="tip-label">{label}</div>
      {payload.map((p) => (
        <div className="tip-row" key={String(p.dataKey)}>
          <span className="dot-row">
            <span className="swatch" style={{ background: p.color }} />
            <span className="faint">{p.name}</span>
          </span>
          <strong className="num">
            {formatAmount(Number(p.value ?? 0))} {currency}
          </strong>
        </div>
      ))}
    </div>
  );
}

/** Balance or any running quantity over time. */
export function TrendLine({
  data,
  dataKey = 'value',
  name,
  currency,
  height = 260,
  color,
}: {
  data: { label: string; value: number }[];
  dataKey?: string;
  name: string;
  currency: string;
  height?: number;
  color?: string;
}) {
  const t = useTokens();
  const stroke = color ?? t.accent;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.faint)} minTickGap={28} />
        <YAxis {...axisProps(t.faint)} width={64} tickFormatter={(v) => formatAmount(Number(v))} />
        <Tooltip
          cursor={{ stroke: t.grid, strokeWidth: 1 }}
          content={<TipContent currency={currency} />}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={stroke}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg)' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Spending over time, filled so the volume of the period reads at a glance. */
export function TrendArea({
  data,
  currency,
  height = 240,
  color,
}: {
  data: { label: string; value: number }[];
  currency: string;
  height?: number;
  color?: string;
}) {
  const t = useTokens();
  const stroke = color ?? t.negative;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.faint)} minTickGap={24} />
        <YAxis {...axisProps(t.faint)} width={64} tickFormatter={(v) => formatAmount(Number(v))} />
        <Tooltip
          cursor={{ stroke: t.grid, strokeWidth: 1 }}
          content={<TipContent currency={currency} />}
        />
        <Area
          type="monotone"
          dataKey="value"
          name="Spent"
          stroke={stroke}
          strokeWidth={2}
          fill="url(#areaFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Income against expense per month. One axis, because both series are the same unit —
 * a second scale would make the comparison meaningless.
 */
export function IncomeExpenseBars({
  data,
  currency,
  height = 260,
}: {
  data: { label: string; income: number; expense: number }[];
  currency: string;
  height?: number;
}) {
  const t = useTokens();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }} barGap={2}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.faint)} />
        <YAxis {...axisProps(t.faint)} width={64} tickFormatter={(v) => formatAmount(Number(v))} />
        <Tooltip cursor={{ fill: t.grid }} content={<TipContent currency={currency} />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: t.muted }}
          iconType="circle"
          iconSize={8}
        />
        <Bar dataKey="income" name="In" fill={t.positive} radius={[3, 3, 0, 0]} />
        <Bar dataKey="expense" name="Out" fill={t.negative} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranked bars — the most accurate read of a categorical breakdown. */
export function CategoryBars({
  data,
  currency,
  height = 300,
  onSelect,
}: {
  data: { label: string; value: number; color: string }[];
  currency: string;
  height?: number;
  onSelect?: (label: string) => void;
}) {
  const t = useTokens();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={t.grid} horizontal={false} />
        <XAxis type="number" {...axisProps(t.faint)} tickFormatter={(v) => formatAmount(Number(v))} />
        <YAxis
          type="category"
          dataKey="label"
          {...axisProps(t.faint)}
          width={132}
          tick={{ fill: t.muted, fontSize: 12 }}
        />
        <Tooltip cursor={{ fill: t.grid }} content={<TipContent currency={currency} />} />
        <Bar
          dataKey="value"
          name="Spent"
          radius={[0, 3, 3, 0]}
          onClick={(d: unknown) =>
            onSelect?.(String((d as { label?: string } | undefined)?.label ?? ''))
          }
          cursor={onSelect ? 'pointer' : undefined}
        >
          {data.map((d) => (
            <Cell key={d.label} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Cumulative net worth — several accounts as separate lines on a shared scale. */
export function MultiLine({
  data,
  series,
  currency,
  height = 280,
}: {
  data: Record<string, string | number>[];
  series: { key: string; name: string; color: string }[];
  currency: string;
  height?: number;
}) {
  const t = useTokens();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.faint)} minTickGap={28} />
        <YAxis {...axisProps(t.faint)} width={64} tickFormatter={(v) => formatAmount(Number(v))} />
        <Tooltip
          cursor={{ stroke: t.grid, strokeWidth: 1 }}
          content={<TipContent currency={currency} />}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg)' }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
