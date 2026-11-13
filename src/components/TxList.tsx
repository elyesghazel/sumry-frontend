import { useMemo } from 'react';
import { type Transaction, CURRENCY, baseOf, formatAmount, formatSigned, formatDayHeading, formatTime, isTransfer, maskIbansIn, signOf, startOfDay } from '../../core';
import { categoryColor, cssVar, useStore } from '../store';
import { Empty, Swatch } from '../ui';

type Props = {
  transactions: Transaction[];
  /** Day headers with a net per day. */
  grouped?: boolean;
  showAccount?: boolean;
  showBalance?: boolean;
  selected?: Set<string>;
  onToggle?: (tx: Transaction) => void;
  onOpen?: (tx: Transaction) => void;
  empty?: string;
};

/**
 * The ledger row used everywhere entries are listed. Wide screens get columns; phones get
 * two lines (note, then category · account · time) so nothing is cut away.
 */
export function TxList({ transactions, grouped = false, showAccount = true, showBalance = false, selected, onToggle, onOpen, empty = 'Nothing here yet.' }: Props) {
  const { accounts, categories } = useStore();
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.accountName])), [accounts]);
  const catColor = useMemo(() => new Map(categories.map((c) => [c.label, c.color])), [categories]);

  const days = useMemo(() => {
    if (!grouped) return [{ key: 'all', title: '', total: 0, data: transactions }];
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const k = startOfDay(new Date(t.date)).toISOString();
      const list = map.get(k);
      if (list) list.push(t);
      else map.set(k, [t]);
    }
    return [...map.entries()].map(([key, data]) => ({
      key,
      title: formatDayHeading(new Date(key)),
      total: data.filter((t) => !isTransfer(t.kind)).reduce((s, t) => s + signOf(t.kind) * baseOf(t), 0),
      data,
    }));
  }, [transactions, grouped]);

  if (!transactions.length) return <Empty>{empty}</Empty>;

  return (
    <div className="txlist">
      {days.map((d) => (
        <div key={d.key}>
          {grouped ? (
            <div className="txday">
              <span>{d.title}</span>
              <span className={`num money ${d.total > 0 ? 'pos' : ''}`}>{d.total > 0 ? '+' : d.total < 0 ? '−' : ''}{formatAmount(d.total)}</span>
            </div>
          ) : null}
          {d.data.map((tx) => {
            const transfer = isTransfer(tx.kind);
            const sign = signOf(tx.kind);
            const cat = transfer ? (tx.kind === 'TRANSFER_OUT' ? 'Transfer out' : 'Transfer in') : tx.categoryLabel;
            const color = transfer ? cssVar('--ink-3') : tx.categoryLabel ? categoryColor(tx.categoryLabel, catColor.get(tx.categoryLabel)) : cssVar('--accent');
            const acct = accountName.get(tx.userAccountId ?? '') ?? '—';
            const d0 = new Date(tx.date);
            const time = tx.date.length > 10 && (d0.getHours() || d0.getMinutes()) ? formatTime(d0) : '';
            const isSel = selected?.has(tx.id) ?? false;
            return (
              <div key={tx.id} className={`txrow ${onOpen ? 'click' : ''} ${isSel ? 'sel' : ''}`} onClick={() => onOpen?.(tx)}>
                {onToggle ? (
                  <input
                    type="checkbox"
                    className="txcheck"
                    checked={isSel}
                    disabled={transfer}
                    aria-label="Select"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggle(tx)}
                  />
                ) : null}
                <Swatch color={color} />
                <div className="txmain">
                  <div className="truncate">{tx.description ? maskIbansIn(tx.description) : cat ?? 'Entry'}</div>
                  <div className="tiny faint truncate">
                    {cat ? cat : <span className="tag accent" style={{ padding: '0 6px' }}>uncategorised</span>}
                    {!grouped ? ` · ${formatDayHeading(d0)}` : ''}
                    {showAccount ? <span className="show-sm"> · {acct}</span> : null}
                    {time ? ` · ${time}` : ''}
                  </div>
                </div>
                {showAccount ? <span className="txacct faint small truncate hide-sm">{acct}</span> : null}
                <span className={`txamt amount money ${transfer ? 'faint' : sign > 0 ? 'pos' : ''}`}>
                  {sign > 0 ? '+' : '−'}{formatAmount(tx.amount)}
                  {tx.currency !== CURRENCY ? <span className="tiny faint"> {tx.currency}</span> : null}
                  {tx.currency !== CURRENCY ? <div className="tiny faint">{formatAmount(baseOf(tx))} {CURRENCY}</div> : null}
                  {showBalance && tx.balanceAfter !== null ? <div className="tiny faint num">= {formatSigned(tx.balanceAfter)}</div> : null}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
