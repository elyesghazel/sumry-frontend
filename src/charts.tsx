import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Layer,
  Legend,
  Line,
  LineChart,
  Rectangle,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatAmount, formatWhole } from './format';
import { cssVar, useStore } from './store';
import type { HeatCell, SankeyData } from './analytics';

/**
 * Chart primitives.
 *
 * Marks are thin, grids and axes recessive, and every plot ships a hover layer — a chart
 * you can't interrogate is a picture. Values are never printed on every point; the
 * tooltip carries the detail and the axis carries the orientation.
 */

/** Re-reads CSS custom properties whenever the theme flips. */
export function useTokens() {
  const { theme } = useStore();
  const [tokens, setTokens] = useState(() => read());

  function read() {
    return {
      text: cssVar('--ink') || '#1a1814',
      muted: cssVar('--ink-2') || '#4f4a43',
      faint: cssVar('--ink-3') || '#8b857b',
      grid: cssVar('--rule') || 'rgba(0,0,0,0.12)',
      accent: cssVar('--accent') || '#9a6b1f',
      positive: cssVar('--pos') || '#2f6b4f',
      negative: cssVar('--neg') || '#a63d2f',
      paper: cssVar('--paper') || '#f4f1ea',
      card: cssVar('--card') || '#fbfaf6',
    };
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => setTokens(read()));
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => requestAnimationFrame(() => setTokens(read()));
    mq.addEventListener('change', onMq);
    return () => {
      cancelAnimationFrame(id);
      mq.removeEventListener('change', onMq);
    };
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
  payload?: { name?: string; value?: number; color?: string; dataKey?: string; payload?: Record<string, unknown> }[];
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
  height = 240,
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
  const stroke = color ?? t.text;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.faint)} minTickGap={28} />
        <YAxis {...axisProps(t.faint)} width={58} tickFormatter={(v) => formatWhole(Number(v))} />
        <Tooltip cursor={{ stroke: t.grid, strokeWidth: 1 }} content={<TipContent currency={currency} />} />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={stroke} strokeWidth={1.6} dot={false} activeDot={{ r: 3.5, strokeWidth: 2, stroke: t.paper }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Spending over time, filled so the volume of the period reads at a glance. */
export function TrendArea({
  data,
  currency,
  height = 220,
  color,
  name = 'Spent',
}: {
  data: { label: string; value: number }[];
  currency: string;
  height?: number;
  color?: string;
  name?: string;
}) {
  const t = useTokens();
  const stroke = color ?? t.negative;
  const id = `area-${stroke.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.faint)} minTickGap={24} />
        <YAxis {...axisProps(t.faint)} width={58} tickFormatter={(v) => formatWhole(Number(v))} />
        <Tooltip cursor={{ stroke: t.grid, strokeWidth: 1 }} content={<TipContent currency={currency} />} />
        <Area type="monotone" dataKey="value" name={name} stroke={stroke} strokeWidth={1.6} fill={`url(#${id})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Income against expense per month, one shared axis. */
export function IncomeExpenseBars({ data, currency, height = 240 }: { data: { label: string; income: number; expense: number }[]; currency: string; height?: number }) {
  const t = useTokens();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -10 }} barGap={2}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.faint)} />
        <YAxis {...axisProps(t.faint)} width={58} tickFormatter={(v) => formatWhole(Number(v))} />
        <Tooltip cursor={{ fill: t.grid }} content={<TipContent currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 12, color: t.muted }} iconType="circle" iconSize={7} />
        <Bar dataKey="income" name="In" fill={t.positive} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="expense" name="Out" fill={t.negative} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Two series per month: this year and last, for the year-over-year read. */
export function PairedBars({ data, currency, height = 240, names = ['This year', 'Last year'] }: { data: { label: string; current: number; previous: number }[]; currency: string; height?: number; names?: [string, string] }) {
  const t = useTokens();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -10 }} barGap={2}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.faint)} />
        <YAxis {...axisProps(t.faint)} width={58} tickFormatter={(v) => formatWhole(Number(v))} />
        <Tooltip cursor={{ fill: t.grid }} content={<TipContent currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 12, color: t.muted }} iconType="circle" iconSize={7} />
        <Bar dataKey="current" name={names[0]} fill={t.text} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="previous" name={names[1]} fill={t.grid} stroke={t.faint} strokeWidth={0.5} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranked bars — the most accurate read of a categorical breakdown. */
export function CategoryBars({
  data,
  currency,
  height = 280,
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
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }} barCategoryGap={6}>
        <CartesianGrid stroke={t.grid} horizontal={false} />
        <XAxis type="number" {...axisProps(t.faint)} tickFormatter={(v) => formatWhole(Number(v))} />
        <YAxis type="category" dataKey="label" {...axisProps(t.faint)} width={128} tick={{ fill: t.muted, fontSize: 12 }} />
        <Tooltip cursor={{ fill: t.grid }} content={<TipContent currency={currency} />} />
        <Bar
          dataKey="value"
          name="Spent"
          radius={[0, 2, 2, 0]}
          isAnimationActive={false}
          onClick={(d: unknown) => onSelect?.(String((d as { label?: string } | undefined)?.label ?? ''))}
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

/** Several accounts as separate lines on a shared scale. */
export function MultiLine({
  data,
  series,
  currency,
  height = 260,
}: {
  data: Record<string, string | number>[];
  series: { key: string; name: string; color: string; dashed?: boolean }[];
  currency: string;
  height?: number;
}) {
  const t = useTokens();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.faint)} minTickGap={28} />
        <YAxis {...axisProps(t.faint)} width={58} tickFormatter={(v) => formatWhole(Number(v))} />
        <Tooltip cursor={{ stroke: t.grid, strokeWidth: 1 }} content={<TipContent currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={7} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dashed ? '4 3' : undefined} dot={false} activeDot={{ r: 3.5, strokeWidth: 2, stroke: t.paper }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** A tiny line with no axes, for a table cell or a stat foot. */
export function Sparkline({ data, color, height = 28, width = 90 }: { data: number[]; color?: string; height?: number; width?: number }) {
  const t = useTokens();
  if (data.length < 2) return <span className="faint">—</span>;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={pts} fill="none" stroke={color ?? t.text} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Where the money flows: income → categories, ribbons sized by amount. */
export function FlowSankey({ data, currency, height = 380 }: { data: SankeyData; currency: string; height?: number }) {
  const t = useTokens();
  if (!data.links.length) return null;
  const nodeColor = (i: number) => data.nodes[i]?.color ?? t.faint;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Sankey
        data={data}
        nodePadding={12}
        nodeWidth={8}
        margin={{ top: 8, right: 130, bottom: 24, left: 8 }}
        iterations={48}
        link={(props) => {
          const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index } = props;
          const payload = props.payload as unknown as { source: { index: number } };
          return (
            <Layer key={`link-${index}`}>
              <path
                d={`M${sourceX},${sourceY + linkWidth / 2} C${sourceControlX},${sourceY + linkWidth / 2} ${targetControlX},${targetY + linkWidth / 2} ${targetX},${targetY + linkWidth / 2} L${targetX},${targetY - linkWidth / 2} C${targetControlX},${targetY - linkWidth / 2} ${sourceControlX},${sourceY - linkWidth / 2} ${sourceX},${sourceY - linkWidth / 2} Z`}
                fill={nodeColor(payload.source.index)}
                fillOpacity={0.22}
                stroke="none"
              />
            </Layer>
          );
        }}
        node={(props) => {
          const { x, y, width, height: h, index } = props;
          const payload = props.payload as unknown as { name: string; value: number };
          return (
            <Layer key={`node-${index}`}>
              <Rectangle x={x} y={y} width={width} height={h} fill={nodeColor(index)} radius={1} />
              <text x={x + width + 6} y={y + h / 2} dy={4} fontSize={11.5} fill={t.muted}>
                {payload.name.trim()}
              </text>
              <text x={x + width + 6} y={y + h / 2} dy={17} fontSize={10.5} fill={t.faint} className="num">
                {formatWhole(payload.value)} {currency}
              </text>
            </Layer>
          );
        }}
      >
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { source?: { name: string }; target?: { name: string }; value?: number; name?: string };
            const label = p.source && p.target ? `${p.source.name.trim()} → ${p.target.name.trim()}` : p.name;
            return (
              <div className="tip">
                <div className="tip-label">{label}</div>
                <strong className="num">{formatAmount(Number(p.value ?? 0))} {currency}</strong>
              </div>
            );
          }}
        />
      </Sankey>
    </ResponsiveContainer>
  );
}

/** GitHub-style daily spend, one column per week, Monday at the top. */
export function Heatmap({ cells, currency }: { cells: HeatCell[]; currency: string }) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  // Month labels sit above the first column of each month.
  const months: { index: number; label: string }[] = [];
  cells.forEach((c, i) => {
    if (i % 7 === 0) {
      const col = i / 7;
      const prev = cells[i - 7];
      if (!prev || prev.date.getMonth() !== c.date.getMonth()) {
        months.push({ index: col, label: c.date.toLocaleDateString(undefined, { month: 'short' }) });
      }
    }
  });
  const cols = Math.ceil(cells.length / 7);
  return (
    <div className="scroll-x">
      <div style={{ position: 'relative', height: 14, marginBottom: 4, width: cols * 15 }}>
        {months.map((m) => (
          <span key={m.index} className="tiny faint" style={{ position: 'absolute', left: m.index * 15 }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="heat" style={{ width: cols * 15 }} onMouseLeave={() => setHover(null)}>
        {cells.map((c) => (
          <div key={c.iso} className="cell" data-l={c.level} onMouseEnter={() => setHover(c)} title={`${c.iso}: ${formatAmount(c.value)} ${currency}`} />
        ))}
      </div>
      <div className="tiny faint" style={{ marginTop: 8, minHeight: 16 }}>
        {hover ? `${hover.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatAmount(hover.value)} ${currency}` : 'Hover a day'}
      </div>
    </div>
  );
}
