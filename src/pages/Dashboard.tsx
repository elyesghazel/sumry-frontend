import { useMemo } from 'react';
import { useStore, categoryColor, cssVar, SERIES } from '../store';
import { Card, Delta, DeltaPercent, Empty, Stat, Swatch } from '../ui';
import { CategoryBars, IncomeExpenseBars, TrendArea, TrendLine } from '../charts';
import { CURRENCY, formatAmount, formatDayHeading, isTransfer, signOf } from '../format';
import {
  accountDelta,
  balanceSeries,
  categoryBreakdown,
  frequentDescriptions,
  monthlySeries,
  pctChange,
  previousRange,
  resolveRange,
  spendBuckets,
  totals,
  TIMEFRAMES,
} from '../analytics';

export function Dashboard({ onDrill }: { onDrill: (q: string) => void }) {
  const { accounts, categories, transactions, budgets, progress, timeframe, setTimeframe } =
    useStore();

  const range = useMemo(() => resolveRange(timeframe), [timeframe]);
  const prior = useMemo(() => previousRange(range), [range]);

  const now = useMemo(() => totals(transactions, range), [transactions, range]);
  const before = useMemo(() => totals(transactions, prior), [transactions, prior]);

  const netWorth = accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
  const netChange = accounts.reduce((s, a) => s + accountDelta(a, transactions, range), 0);

  const balance = useMemo(
    () => balanceSeries(accounts, transactions, range),
    [accounts, transactions, range],
  );
  const spend = useMemo(
    () => spendBuckets(transactions, range).map((b) => ({ label: b.label, value: b.value })),
    [transactions, range],
  );
  const months = useMemo(() => monthlySeries(transactions, 6), [transactions]);
  const byCategory = useMemo(() => categoryBreakdown(transactions, range), [transactions, range]);
  const frequent = useMemo(() => frequentDescriptions(transactions, range, 5), [transactions, range]);

  const categoryByLabel = useMemo(
    () => new Map(categories.map((c) => [c.label, c])),
    [categories],
  );

  /**
   * Eight hues, never cycled to invent a ninth: everything past the top eight folds into
   * a single neutral "Other" rather than reusing a colour that already means something.
   */
  const ranked = useMemo(() => {
    const top = byCategory.slice(0, 8).map((c) => ({
      label: c.label,
      value: c.value,
      share: c.share,
      count: c.count,
      color: categoryColor(c.label, categoryByLabel.get(c.label)?.color),
    }));
    const rest = byCategory.slice(8);
    if (rest.length) {
      top.push({
        label: `Other (${rest.length})`,
        value: rest.reduce((s, c) => s + c.value, 0),
        share: rest.reduce((s, c) => s + c.share, 0),
        count: rest.reduce((s, c) => s + c.count, 0),
        color: cssVar('--text-faint'),
      });
    }
    return top;
  }, [byCategory, categoryByLabel]);

  const recent = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8),
    [transactions],
  );

  const accountName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.accountName])),
    [accounts],
  );

  const progressByLabel = useMemo(
    () => new Map(progress.map((p) => [p.categoryLabel, p])),
    [progress],
  );

  const perDay = now.expense / Math.max(1, range.days);

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
        {/* Headline: one number large, its movement beneath it. */}
        <Card span="span-4">
          <div className="caption">Total balance</div>
          <div className="hero-value num" style={{ marginTop: 6 }}>
            {formatAmount(netWorth)}{' '}
            <span className="faint" style={{ fontSize: 16 }}>
              {CURRENCY}
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Delta value={netChange} suffix={`· ${range.label.toLowerCase()}`} />
          </div>
        </Card>

        <Card span="span-8">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            <Stat
              label="Spent"
              value={formatAmount(now.expense)}
              foot={<DeltaPercent value={pctChange(now.expense, before.expense)} invert />}
            />
            <Stat
              label="Received"
              value={formatAmount(now.income)}
              foot={<DeltaPercent value={pctChange(now.income, before.income)} />}
            />
            <Stat
              label="Net"
              value={`${now.net < 0 ? '−' : ''}${formatAmount(now.net)}`}
              foot={<Delta value={now.net} showUnit={false} />}
            />
            <Stat
              label="Per day"
              value={formatAmount(perDay)}
              foot={<span className="caption">{now.count} entries</span>}
            />
          </div>
        </Card>

        <Card title="Balance over time" span="span-7">
          {balance.length > 1 ? (
            <TrendLine data={balance} name="Balance" currency={CURRENCY} />
          ) : (
            <Empty>Not enough history in this period.</Empty>
          )}
        </Card>

        <Card title="Spending" span="span-5">
          {spend.some((s) => s.value > 0) ? (
            <TrendArea data={spend} currency={CURRENCY} />
          ) : (
            <Empty>Nothing spent in this period.</Empty>
          )}
        </Card>

        <Card
          title="Where it goes"
          span="span-7"
          action={<span className="caption">click a bar to filter</span>}
        >
          {ranked.length ? (
            <CategoryBars
              data={ranked.map((r) => ({ label: r.label, value: r.value, color: r.color }))}
              currency={CURRENCY}
              onSelect={(label) => onDrill(label.startsWith('Other') ? '' : label)}
            />
          ) : (
            <Empty>Nothing spent in this period.</Empty>
          )}
        </Card>

        <Card title="Income vs expense" span="span-5">
          <IncomeExpenseBars data={months} currency={CURRENCY} />
        </Card>

        <Card title="Accounts" span="span-4">
          <div className="list">
            {accounts.map((a, i) => (
              <div key={a.id}>
                <div className="row-between">
                  <span className="dot-row">
                    <Swatch color={cssVar(SERIES[i % SERIES.length])} />
                    <span className="truncate">{a.accountName}</span>
                  </span>
                  <span className="num">{formatAmount(a.currentBalance ?? 0)}</span>
                </div>
                <div style={{ marginTop: 4, textAlign: 'right' }}>
                  <Delta value={accountDelta(a, transactions, range)} />
                </div>
              </div>
            ))}
            {accounts.length === 0 ? <Empty>No accounts yet.</Empty> : null}
          </div>
        </Card>

        <Card title="Budgets" span="span-4">
          <div className="list">
            {budgets.map((b) => {
              const spent = progressByLabel.get(b.categoryLabel)?.spentAmount ?? 0;
              const pct = b.limitAmount > 0 ? spent / b.limitAmount : 1;
              const over = pct > 1;
              return (
                <div key={b.id}>
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <span className="truncate">{b.categoryLabel}</span>
                    <span className={`num ${over ? 'neg' : 'muted'}`}>
                      {formatAmount(spent)} / {formatAmount(b.limitAmount)}
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.min(100, Math.max(2, pct * 100))}%`,
                        background: over
                          ? 'var(--negative)'
                          : pct > 0.8
                            ? 'var(--accent)'
                            : 'var(--positive)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {budgets.length === 0 ? <Empty>No budgets set. Add them in the app.</Empty> : null}
          </div>
        </Card>

        <Card title="Most frequent" span="span-4">
          <div className="list">
            {frequent.map((f) => (
              <div className="row-between" key={f.label}>
                <span className="truncate">{f.label}</span>
                <span>
                  <span className="caption" style={{ marginRight: 10 }}>
                    {f.count}×
                  </span>
                  <span className="num muted">{formatAmount(f.total)}</span>
                </span>
              </div>
            ))}
            {frequent.length === 0 ? <Empty>No repeated notes yet.</Empty> : null}
          </div>
        </Card>

        <Card
          title="Recent activity"
          span="span-12"
          action={
            <button className="chip" onClick={() => onDrill('')}>
              See all
            </button>
          }
        >
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Note</th>
                  <th>Account</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((tx) => {
                  const transfer = isTransfer(tx.kind);
                  const sign = signOf(tx.kind);
                  return (
                    <tr key={tx.id}>
                      <td className="faint">{formatDayHeading(new Date(tx.date))}</td>
                      <td>
                        <span className="dot-row">
                          <Swatch
                            color={
                              transfer
                                ? cssVar('--text-faint')
                                : categoryColor(
                                    tx.categoryLabel ?? '',
                                    categoryByLabel.get(tx.categoryLabel ?? '')?.color,
                                  )
                            }
                          />
                          {transfer
                            ? tx.kind === 'TRANSFER_OUT'
                              ? 'Transfer out'
                              : 'Transfer in'
                            : (tx.categoryLabel ?? 'Uncategorised')}
                        </span>
                      </td>
                      <td className="muted truncate" style={{ maxWidth: 260 }}>
                        {tx.description ?? '—'}
                      </td>
                      <td className="faint">{accountName.get(tx.userAccountId ?? '') ?? '—'}</td>
                      <td
                        className={`right num ${transfer ? 'faint' : sign > 0 ? 'pos' : 'neg'}`}
                      >
                        {sign > 0 ? '+' : '−'}
                        {formatAmount(tx.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
