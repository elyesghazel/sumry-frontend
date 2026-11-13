import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type SearchParams,
  type Transaction,
  type TransactionPage,
  CURRENCY,
  baseOf,
  formatAmount,
  isTransfer,
  isoDay,
  signOf,
  resolveRange,
  type Timeframe,
} from '../../core';
import { api } from '../api';
import { categoryColor, cssVar, useStore, type Route } from '../store';
import { Chips, Empty, Section, Swatch } from '../ui';
import { TransactionEditor } from '../components/Editor';

type Period = Timeframe | 'all' | 'custom';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: '30d', label: '30 days' },
  { key: '3m', label: '3 months' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];
const KINDS = [
  { key: '', label: 'All' },
  { key: 'EXPENSE', label: 'Spending' },
  { key: 'INCOME', label: 'Income' },
  { key: 'TRANSFER', label: 'Transfers' },
] as const;

const PAGE_SIZE = 60;

/** The full ledger: filtered on the server, paged, with totals for the whole match. */
export function Activity({ route }: { route: Route }) {
  const { accounts, categories, token, transactions } = useStore();
  const [query, setQuery] = useState(route.params.get('q') ?? '');
  const [category, setCategory] = useState(route.params.get('category') ?? '');
  const [account, setAccount] = useState(route.params.get('account') ?? '');
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>('');
  const [period, setPeriod] = useState<Period>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'date' | 'amount'>('date');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<TransactionPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Transaction | null | undefined>(undefined);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    setQuery(route.params.get('q') ?? '');
    setCategory(route.params.get('category') ?? '');
    setAccount(route.params.get('account') ?? '');
    setPage(0);
  }, [route]);

  const categoryByLabel = useMemo(() => new Map(categories.map((c) => [c.label, c])), [categories]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.accountName])), [accounts]);

  const params = useMemo<SearchParams>(() => {
    let f = from, t = to;
    if (period !== 'all' && period !== 'custom') {
      const r = resolveRange(period);
      f = isoDay(r.from);
      t = isoDay(r.to);
    }
    if (period === 'all') { f = ''; t = ''; }
    return { q: query.trim() || undefined, categoryLabel: category || undefined, accountId: account || undefined, kind: kind || undefined, from: f || undefined, to: t || undefined, page, size: PAGE_SIZE, sort, dir: 'desc' };
  }, [query, category, account, kind, period, from, to, sort, page]);

  // Any edit anywhere refreshes the shared transaction list; re-run the search then too.
  useEffect(() => {
    if (!token) return;
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      setBusy(true);
      try {
        setResult(await api.search(token, params));
      } finally {
        setBusy(false);
      }
    }, 180);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [token, params, transactions]);

  const reset = () => { setQuery(''); setCategory(''); setAccount(''); setKind(''); setPeriod('all'); setPage(0); };
  const filtered = Boolean(query || category || account || kind || period !== 'all');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="sub">{result ? `${result.total} entries${filtered ? ' match' : ''}` : '…'}</p>
        </div>
        <button className="btn primary" onClick={() => setEditor(null)}>+ New entry</button>
      </div>

      <div className="stack">
        <div className="row wrap" style={{ gap: 10 }}>
          <input className="input" style={{ flex: '1 1 240px', maxWidth: 380 }} placeholder="Search notes and categories…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
          <Chips options={PERIODS} value={period} onChange={(p) => { if (p === 'custom' && !from) { setFrom(isoDay(resolveRange('month').from)); setTo(isoDay(new Date())); } setPeriod(p); setPage(0); }} />
          {period === 'custom' ? (
            <span className="row" style={{ gap: 6 }}>
              <input className="input" style={{ width: 150 }} type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
              <span className="faint">→</span>
              <input className="input" style={{ width: 150 }} type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
            </span>
          ) : null}
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Chips options={KINDS as unknown as { key: string; label: string }[]} value={kind} onChange={(k) => { setKind(k as typeof kind); setPage(0); }} />
          <select className="input" style={{ width: 'auto' }} value={account} onChange={(e) => { setAccount(e.target.value); setPage(0); }}>
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
          </select>
          <select className="input" style={{ width: 'auto', maxWidth: 220 }} value={category} onChange={(e) => { setCategory(e.target.value); setPage(0); }}>
            <option value="">All categories</option>
            {[...categories].sort((a, b) => a.label.localeCompare(b.label)).map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
          </select>
          <button className="chip" onClick={() => setSort(sort === 'date' ? 'amount' : 'date')}>Sort: {sort === 'date' ? 'newest' : 'largest'}</button>
          {filtered ? <button className="link small" onClick={reset}>Clear</button> : null}
          <span className="grow" />
          {result ? (
            <span className="row small" style={{ gap: 16 }}>
              <span className="muted">in <strong className="num money pos">{formatAmount(result.sums.income)}</strong></span>
              <span className="muted">out <strong className="num money neg">{formatAmount(result.sums.expense)}</strong></span>
              <span className="muted">net <strong className={`num money ${result.sums.net < 0 ? 'neg' : 'pos'}`}>{result.sums.net < 0 ? '−' : ''}{formatAmount(result.sums.net)}</strong></span>
            </span>
          ) : null}
        </div>
      </div>

      <Section span="span-12" title={busy ? 'Loading…' : `Page ${page + 1} of ${Math.max(1, result?.totalPages ?? 1)}`} action={
        result && result.totalPages > 1 ? (
          <span className="row" style={{ gap: 6 }}>
            <button className="btn sm ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>← Newer</button>
            <button className="btn sm ghost" disabled={page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Older →</button>
          </span>
        ) : null
      }>
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Note</th><th className="hide-sm">Account</th><th className="right">Amount</th><th className="right hide-sm">Balance after</th></tr>
            </thead>
            <tbody>
              {(result?.items ?? []).map((tx) => {
                const transfer = isTransfer(tx.kind);
                const sign = signOf(tx.kind);
                const d = new Date(tx.date);
                return (
                  <tr key={tx.id} className="click" onClick={() => setEditor(tx)} title="Edit">
                    <td className="faint small" style={{ whiteSpace: 'nowrap' }}>{d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                    <td>
                      <span className="dot-row">
                        <Swatch color={transfer ? cssVar('--ink-3') : categoryColor(tx.categoryLabel ?? '', categoryByLabel.get(tx.categoryLabel ?? '')?.color)} />
                        <span className="truncate">{transfer ? (tx.kind === 'TRANSFER_OUT' ? 'Transfer out' : 'Transfer in') : (tx.categoryLabel ?? 'Uncategorised')}</span>
                      </span>
                    </td>
                    <td className="muted truncate" style={{ maxWidth: 320 }}>{tx.description ?? '—'}</td>
                    <td className="faint hide-sm">{accountName.get(tx.userAccountId ?? '') ?? '—'}</td>
                    <td className={`right amount money ${transfer ? 'faint' : sign > 0 ? 'pos' : ''}`}>
                      {sign > 0 ? '+' : '−'}{formatAmount(tx.amount)}
                      {tx.currency !== CURRENCY ? <span className="tiny faint"> {tx.currency} · {formatAmount(baseOf(tx))} {CURRENCY}</span> : null}
                    </td>
                    <td className="right num faint hide-sm money">{tx.balanceAfter === null ? '—' : formatAmount(tx.balanceAfter)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {result && result.items.length === 0 ? <Empty>Nothing matches these filters.</Empty> : null}
        {result && result.totalPages > 1 ? (
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 14 }}>
            <button className="btn sm" disabled={page === 0} onClick={() => { setPage(page - 1); window.scrollTo({ top: 0 }); }}>← Newer</button>
            <span className="tiny faint">{page + 1} / {result.totalPages}</span>
            <button className="btn sm" disabled={page + 1 >= result.totalPages} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0 }); }}>Older →</button>
          </div>
        ) : null}
      </Section>

      {editor !== undefined ? <TransactionEditor editing={editor} onClose={() => setEditor(undefined)} presetAccountId={account || undefined} /> : null}
    </>
  );
}
