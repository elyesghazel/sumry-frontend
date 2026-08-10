import { useMemo, useState } from 'react';
import { categoryColor, cssVar, useStore } from '../store';
import { BarRow, Card, Delta, DeltaPercent, Empty, Stat, Swatch } from '../ui';
import { MultiLine, TrendArea, TrendLine } from '../charts';
import { CURRENCY, formatAmount, isTransfer, signOf } from '../format';
import {
  categoryBreakdown,
  inRange,
  monthlySeries,
  pctChange,
  previousRange,
  resolveRange,
  spendBuckets,
  totals,
  TIMEFRAMES,
} from '../analytics';

/** The deeper cut: per-category trends, weekday rhythm and running comparisons. */
export function Analytics({ onDrill }: { onDrill: (q: string) => void }) {
  const { transactions, categories, timeframe, setTimeframe } = useStore();
  const [selected, setSelected] = useState<string | null>(null);

  const range = useMemo(() => resolveRange(timeframe), [timeframe]);
  const prior = useMemo(() => previousRange(range), [range]);

  const now = useMemo(() => totals(transactions, range), [transactions, range]);
  const before = useMemo(() => totals(transactions, prior), [transactions, prior]);

  const byCategory = useMemo(() => categoryBreakdown(transactions, range), [transactions, range]);
  const months = useMemo(() => monthlySeries(transactions, 12), [transactions]);

  const categoryByLabel = useMemo(
    () => new Map(categories.map((c) => [c.label, c])),
    [categories],
  );

  const focus = selected ?? byCategory[0]?.label ?? null;

  // Spending in the focused category over the window.
  const focusSeries = useMemo(() => {
    if (!focus) return [];
    const only = transactions.filter((t) => t.categoryLabel === focus);
    return spendBuckets(only, range).map((b) => ({ label: b.label, value: b.value }));
  }, [transactions, focus, range]);

  /** Which days of the week the money actually leaves. */
  const weekday = useMemo(() => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sums = new Array(7).fill(0);
    for (const tx of transactions) {
      if (isTransfer(tx.kind) || signOf(tx.kind) > 0 || !inRange(tx, range)) continue;
      sums[new Date(tx.date).getDay()] += tx.amount;
    }
    // Weeks read Monday-first here; Sunday moves to the end.
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.map((i) => ({ label: names[i], value: sums[i] }));
  }, [transactions, range]);

  // Cumulative spend this period against the one before, indexed to day number so the
  // two windows are directly comparable on one scale.
  const paceData = useMemo(() => {
    const cur = spendBuckets(transactions, range);
    const prev = spendBuckets(transactions, prior);
    const len = Math.max(cur.length, prev.length);
    let a = 0;
    let b = 0;
    const out: Record<string, string | number>[] = [];
    for (let i = 0; i < len; i++) {
      a += cur[i]?.value ?? 0;
      b += prev[i]?.value ?? 0;
      out.push({ label: String(i + 1), current: a, previous: b });
    }
    return out;
  }, [transactions, range, prior]);

  const totalSpend = byCategory.reduce((s, c) => s + c.value, 0);

  return (
    <>
      <div className="chips">
        {TIMEFRAMES.map((t) => (
          <button
            key={t.key}
            className="chip"
            aria-pressed={timeframe === t.key}
            onClick={() => setTimeframe(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid">
        <Card span="span-12">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            <Stat
              label={`Spent · ${range.label}`}
              value={formatAmount(now.expense)}
              foot={<DeltaPercent value={pctChange(now.expense, before.expense)} invert />}
            />
            <Stat
              label="Received"
              value={formatAmount(now.income)}
              foot={<DeltaPercent value={pctChange(now.income, before.income)} />}
            />
            <Stat label="Net" value={formatAmount(now.net)} foot={<Delta value={now.net} />} />
            <Stat
              label="Categories used"
              value={String(byCategory.length)}
              foot={<span className="caption">{now.count} entries</span>}
            />
          </div>
        </Card>

        <Card
          title="Pace vs previous period"
          span="span-7"
          action={<span className="caption">cumulative spend by day of period</span>}
        >
          <MultiLine
            data={paceData}
            currency={CURRENCY}
            series={[
              { key: 'current', name: 'This period', color: cssVar('--negative') },
              { key: 'previous', name: 'Previous', color: cssVar('--text-faint') },
            ]}
          />
        </Card>

        <Card title="By weekday" span="span-5">
          <TrendArea data={weekday} currency={CURRENCY} height={280} />
        </Card>

        <Card
          title="Category breakdown"
          span="span-5"
          action={<span className="caption">click to focus</span>}
        >
          <div className="list">
            {byCategory.slice(0, 10).map((c) => (
              <BarRow
                key={c.label}
                label={c.label}
                value={c.value}
                share={c.share}
                meta={`${c.count}×`}
                color={categoryColor(c.label, categoryByLabel.get(c.label)?.color)}
                onClick={() => setSelected(c.label)}
              />
            ))}
            {byCategory.length === 0 ? <Empty>Nothing spent in this period.</Empty> : null}
          </div>
        </Card>

        <Card
          title={focus ? `${focus} over time` : 'Category over time'}
          span="span-7"
          action={
            focus ? (
              <button className="chip" onClick={() => onDrill(focus)}>
                Show transactions
              </button>
            ) : null
          }
        >
          {focus && focusSeries.some((s) => s.value > 0) ? (
            <>
              <div className="row-between" style={{ marginBottom: 10 }}>
                <span className="dot-row">
                  <Swatch
                    color={categoryColor(focus, categoryByLabel.get(focus)?.color)}
                  />
                  <span className="muted">
                    {formatAmount(byCategory.find((c) => c.label === focus)?.value ?? 0)}{' '}
                    {CURRENCY} ·{' '}
                    {Math.round(
                      ((byCategory.find((c) => c.label === focus)?.value ?? 0) /
                        (totalSpend || 1)) *
                        100,
                    )}
                    % of spending
                  </span>
                </span>
              </div>
              <TrendArea
                data={focusSeries}
                currency={CURRENCY}
                height={230}
                color={categoryColor(focus, categoryByLabel.get(focus)?.color)}
              />
            </>
          ) : (
            <Empty>Pick a category to see its trend.</Empty>
          )}
        </Card>

        <Card title="Twelve month history" span="span-12">
          <TrendLine
            data={months.map((m) => ({ label: m.label, value: m.expense }))}
            name="Spent"
            currency={CURRENCY}
            color={cssVar('--negative')}
            height={220}
          />
        </Card>
      </div>
    </>
  );
}
