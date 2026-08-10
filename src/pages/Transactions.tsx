import { useEffect, useMemo, useState } from 'react';
import { categoryColor, cssVar, useStore } from '../store';
import { Card, Empty, Swatch } from '../ui';
import { formatAmount, isTransfer, signOf } from '../format';
import { resolveRange, type Timeframe } from '../analytics';

type Sort = 'date' | 'amount';

/** Period options for the list. `all` and `custom` sit outside the shared timeframes. */
type Period = Timeframe | 'all' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: '30d', label: 'Last 30 days' },
  { key: '3m', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function Transactions({ initialQuery }: { initialQuery: string }) {
  const { transactions, categories, accounts } = useStore();

  const [query, setQuery] = useState(initialQuery);
  const [account, setAccount] = useState<string>('');
  const [kind, setKind] = useState<'all' | 'in' | 'out' | 'transfer'>('all');
  const [sort, setSort] = useState<Sort>('date');
  const [period, setPeriod] = useState<Period>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(100);

  useEffect(() => setQuery(initialQuery), [initialQuery]);

  const categoryByLabel = useMemo(
    () => new Map(categories.map((c) => [c.label, c])),
    [categories],
  );
  const accountName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.accountName])),
    [accounts],
  );

  // Resolved once per render rather than per row.
  const window = useMemo(() => {
    if (period === 'all') return null;
    if (period === 'custom') {
      if (!from && !to) return null;
      return {
        // An empty bound means "open ended" on that side.
        from: from ? new Date(`${from}T00:00:00`) : new Date(0),
        // The `to` date is inclusive, so run to the end of that day.
        to: to ? new Date(`${to}T23:59:59.999`) : new Date(8.64e15),
      };
    }
    const r = resolveRange(period);
    return { from: r.from, to: r.to };
  }, [period, from, to]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = transactions.filter((tx) => {
      if (account && tx.userAccountId !== account) return false;
      if (window) {
        const t = new Date(tx.date).getTime();
        if (t < window.from.getTime() || t > window.to.getTime()) return false;
      }
      if (kind === 'in' && !(signOf(tx.kind) > 0 && !isTransfer(tx.kind))) return false;
      if (kind === 'out' && !(signOf(tx.kind) < 0 && !isTransfer(tx.kind))) return false;
      if (kind === 'transfer' && !isTransfer(tx.kind)) return false;
      if (!needle) return true;
      return (
        (tx.description ?? '').toLowerCase().includes(needle) ||
        (tx.categoryLabel ?? '').toLowerCase().includes(needle) ||
        formatAmount(tx.amount).includes(needle)
      );
    });

    rows.sort((a, b) =>
      sort === 'amount'
        ? b.amount - a.amount
        : new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return rows;
  }, [transactions, query, account, kind, sort, window]);

  // Totals reflect the current filter, so a filtered view answers "how much is this?".
  const sum = useMemo(() => {
    let inn = 0;
    let out = 0;
    for (const tx of filtered) {
      if (isTransfer(tx.kind)) continue;
      if (signOf(tx.kind) > 0) inn += tx.amount;
      else out += tx.amount;
    }
    return { inn, out };
  }, [filtered]);

  return (
    <div className="grid">
      <Card span="span-12">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            style={{ flex: '1 1 260px', maxWidth: 420 }}
            placeholder="Search notes, categories, amounts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="chips">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className="chip"
                aria-pressed={period === p.key}
                onClick={() => {
                  // Seed the custom range with the current month so it is never empty.
                  if (p.key === 'custom' && !from && !to) {
                    const r = resolveRange('month');
                    setFrom(iso(r.from));
                    setTo(iso(new Date()));
                  }
                  setPeriod(p.key);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                style={{ width: 160 }}
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span className="faint">→</span>
              <input
                className="input"
                style={{ width: 160 }}
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          ) : null}

          <div className="chips">
            {(['all', 'out', 'in', 'transfer'] as const).map((k) => (
              <button
                key={k}
                className="chip"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k === 'all' ? 'All' : k === 'out' ? 'Spending' : k === 'in' ? 'Income' : 'Transfers'}
              </button>
            ))}
          </div>

          <div className="chips">
            <button className="chip" aria-pressed={account === ''} onClick={() => setAccount('')}>
              All accounts
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                className="chip"
                aria-pressed={account === a.id}
                onClick={() => setAccount(a.id)}
              >
                {a.accountName}
              </button>
            ))}
          </div>

          <button
            className="chip"
            onClick={() => setSort(sort === 'date' ? 'amount' : 'date')}
            title="Toggle sort"
          >
            Sort: {sort === 'date' ? 'newest' : 'largest'}
          </button>
        </div>

        <div
          className="row-between"
          style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}
        >
          <span className="caption">
            {filtered.length} of {transactions.length} entries
          </span>
          <span style={{ display: 'flex', gap: 18 }}>
            <span className="caption">
              in <strong className="num pos">{formatAmount(sum.inn)}</strong>
            </span>
            <span className="caption">
              out <strong className="num neg">{formatAmount(sum.out)}</strong>
            </span>
            <span className="caption">
              net <strong className="num">{formatAmount(sum.inn - sum.out)}</strong>
            </span>
          </span>
        </div>
      </Card>

      <Card span="span-12">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Note</th>
                <th>Account</th>
                <th className="right">Amount</th>
                <th className="right">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((tx) => {
                const transfer = isTransfer(tx.kind);
                const sign = signOf(tx.kind);
                const d = new Date(tx.date);
                return (
                  <tr key={tx.id}>
                    <td className="faint" style={{ whiteSpace: 'nowrap' }}>
                      {d.toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </td>
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
                    <td className="muted truncate" style={{ maxWidth: 320 }}>
                      {tx.description ?? '—'}
                    </td>
                    <td className="faint">{accountName.get(tx.userAccountId ?? '') ?? '—'}</td>
                    <td className={`right num ${transfer ? 'faint' : sign > 0 ? 'pos' : ''}`}>
                      {sign > 0 ? '+' : '−'}
                      {formatAmount(tx.amount)}
                    </td>
                    <td className="right num faint">
                      {tx.balanceAfter === null ? '—' : formatAmount(tx.balanceAfter)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 ? <Empty>Nothing matches these filters.</Empty> : null}

        {filtered.length > limit ? (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button className="btn" onClick={() => setLimit(limit + 200)}>
              Show more ({filtered.length - limit} remaining)
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
