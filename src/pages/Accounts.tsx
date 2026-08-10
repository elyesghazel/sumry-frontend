import { useMemo } from 'react';
import { cssVar, SERIES, useStore } from '../store';
import { Card, Delta, Empty, Stat, Swatch } from '../ui';
import { MultiLine } from '../charts';
import { CURRENCY, formatAmount, signOf } from '../format';
import { accountDelta, balanceSeries, inRange, resolveRange, TIMEFRAMES } from '../analytics';

export function Accounts() {
  const { accounts, transactions, timeframe, setTimeframe } = useStore();

  const range = useMemo(() => resolveRange(timeframe), [timeframe]);

  const colorFor = (i: number) => cssVar(SERIES[i % SERIES.length]);

  /**
   * Each account's balance over the window, on one shared axis. Reconstructed by undoing
   * transactions backwards from today, since the API keeps current balances only.
   */
  const series = useMemo(() => {
    const perAccount = accounts.map((a) =>
      balanceSeries(
        [a],
        transactions.filter((t) => t.userAccountId === a.id),
        range,
      ),
    );
    const length = perAccount[0]?.length ?? 0;
    const rows: Record<string, string | number>[] = [];
    for (let i = 0; i < length; i++) {
      const row: Record<string, string | number> = { label: perAccount[0][i].label };
      accounts.forEach((a, ai) => {
        row[a.id] = perAccount[ai]?.[i]?.value ?? 0;
      });
      rows.push(row);
    }
    return rows;
  }, [accounts, transactions, range]);

  const netWorth = accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0);

  const activity = useMemo(() => {
    const map = new Map<string, { count: number; inn: number; out: number }>();
    for (const a of accounts) map.set(a.id, { count: 0, inn: 0, out: 0 });
    for (const tx of transactions) {
      if (!inRange(tx, range)) continue;
      const entry = map.get(tx.userAccountId ?? '');
      if (!entry) continue;
      entry.count += 1;
      if (signOf(tx.kind) > 0) entry.inn += tx.amount;
      else entry.out += tx.amount;
    }
    return map;
  }, [accounts, transactions, range]);

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
        <Card span="span-4">
          <div className="caption">Net worth</div>
          <div className="hero-value num" style={{ marginTop: 6 }}>
            {formatAmount(netWorth)}{' '}
            <span className="faint" style={{ fontSize: 16 }}>
              {CURRENCY}
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Delta
              value={accounts.reduce((s, a) => s + accountDelta(a, transactions, range), 0)}
              suffix={`· ${range.label.toLowerCase()}`}
            />
          </div>
        </Card>

        <Card span="span-8">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, accounts.length))}, minmax(0,1fr))`,
            }}
          >
            {accounts.map((a) => (
              <Stat
                key={a.id}
                label={a.accountName}
                value={formatAmount(a.currentBalance ?? 0)}
                foot={<Delta value={accountDelta(a, transactions, range)} />}
              />
            ))}
          </div>
        </Card>

        <Card title="Balances over time" span="span-12">
          {series.length > 1 ? (
            <MultiLine
              data={series}
              currency={CURRENCY}
              height={320}
              series={accounts.map((a, i) => ({
                key: a.id,
                name: a.accountName,
                color: colorFor(i),
              }))}
            />
          ) : (
            <Empty>Not enough history in this period.</Empty>
          )}
        </Card>

        <Card title="Activity" span="span-12">
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="right">Entries</th>
                  <th className="right">In</th>
                  <th className="right">Out</th>
                  <th className="right">Change</th>
                  <th className="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a, i) => {
                  const stats = activity.get(a.id) ?? { count: 0, inn: 0, out: 0 };
                  return (
                    <tr key={a.id}>
                      <td>
                        <span className="dot-row">
                          <Swatch color={colorFor(i)} />
                          {a.accountName}
                        </span>
                      </td>
                      <td className="right num faint">{stats.count}</td>
                      <td className="right num pos">{formatAmount(stats.inn)}</td>
                      <td className="right num neg">{formatAmount(stats.out)}</td>
                      <td className="right">
                        <Delta value={accountDelta(a, transactions, range)} />
                      </td>
                      <td className="right num">{formatAmount(a.currentBalance ?? 0)}</td>
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
