import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type SearchParams,
  type Timeframe,
  type Transaction,
  type TransactionPage,
  formatAmount,
  formatSigned,
  isTransfer,
  isoDay,
  resolveRange,
} from '../../core';
import { api } from '../api';
import { href, navigate, useStore, type Route } from '../store';
import { Chips, ErrorLine, Section } from '../ui';
import { PageHead } from '../components/Nav';
import { TxList } from '../components/TxList';
import { CategorySelect, TransactionEditor } from '../components/Editor';

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
const num = (s: string) => {
  const v = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
};

/** What happened: every entry, searched and filtered on the server, grouped by day. */
export function Activity({ route }: { route: Route }) {
  const { accounts, categories, token, transactions, refresh, toast } = useStore();
  const p0 = route.params;
  const [query, setQuery] = useState(p0.get('q') ?? '');
  const [category, setCategory] = useState(p0.get('category') ?? '');
  const [account, setAccount] = useState(p0.get('account') ?? '');
  const [uncat, setUncat] = useState(p0.get('uncat') === '1');
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>('');
  const [period, setPeriod] = useState<Period>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [sort, setSort] = useState<'date' | 'amount'>('date');
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [result, setResult] = useState<TransactionPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Transaction | null | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    setQuery(route.params.get('q') ?? '');
    setCategory(route.params.get('category') ?? '');
    setAccount(route.params.get('account') ?? '');
    setUncat(route.params.get('uncat') === '1');
    setPage(0);
    setSelected(new Set());
  }, [route]);

  const range = useMemo(() => {
    if (period === 'all') return { f: '', t: '' };
    if (period === 'custom') return { f: from, t: to };
    const r = resolveRange(period);
    return { f: isoDay(r.from), t: isoDay(r.to) };
  }, [period, from, to]);

  const params = useMemo<SearchParams>(
    () => ({
      q: query.trim() || undefined,
      categoryLabel: category || undefined,
      accountId: account || undefined,
      kind: kind || undefined,
      from: range.f || undefined,
      to: range.t || undefined,
      min: num(min),
      max: num(max),
      page,
      size: PAGE_SIZE,
      sort,
      dir: 'desc',
    }),
    [query, category, account, kind, range, min, max, sort, page],
  );

  // Uncategorised has no server filter: it is a short list, filtered from the loaded ledger.
  const uncategorised = useMemo(() => {
    if (!uncat) return null;
    const q = query.trim().toLowerCase();
    const lo = num(min), hi = num(max);
    return transactions
      .filter((t) => !isTransfer(t.kind) && !t.categoryLabel)
      .filter((t) => !account || t.userAccountId === account)
      .filter((t) => !q || (t.description ?? '').toLowerCase().includes(q))
      .filter((t) => (lo === undefined || t.amount >= lo) && (hi === undefined || t.amount <= hi))
      .filter((t) => (!range.f || t.date.slice(0, 10) >= range.f) && (!range.t || t.date.slice(0, 10) <= range.t))
      .sort((a, b) => (sort === 'amount' ? b.amount - a.amount : b.date.localeCompare(a.date)));
  }, [uncat, transactions, account, query, min, max, range, sort]);

  // Any edit anywhere refreshes the shared transaction list; re-run the search then too.
  useEffect(() => {
    if (!token || uncat) return;
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      setBusy(true);
      try {
        setResult(await api.search(token, params));
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Search failed');
      } finally {
        setBusy(false);
      }
    }, 180);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [token, params, transactions, uncat]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = uncategorised ?? result?.items ?? [];
  const sums = uncategorised
    ? { income: uncategorised.filter((t) => t.kind === 'INCOME').reduce((s, t) => s + t.baseAmount, 0), expense: uncategorised.filter((t) => t.kind === 'EXPENSE').reduce((s, t) => s + t.baseAmount, 0) }
    : result?.sums;
  const total = uncategorised ? uncategorised.length : result?.total ?? 0;
  const totalPages = uncategorised ? 1 : Math.max(1, result?.totalPages ?? 1);

  const reset = () => {
    setQuery(''); setCategory(''); setAccount(''); setKind(''); setPeriod('all'); setMin(''); setMax(''); setPage(0);
    if (uncat) navigate('activity');
  };
  const filtered = Boolean(query || category || account || kind || period !== 'all' || min || max || uncat);

  const toggle = (tx: Transaction) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(tx.id)) n.delete(tx.id);
      else n.add(tx.id);
      return n;
    });
  const selectable = items.filter((t) => !isTransfer(t.kind));
  const allSelected = selectable.length > 0 && selectable.every((t) => selected.has(t.id));

  const applyBulk = async () => {
    if (!token || !bulkCat || !selected.size) return;
    setBulkBusy(true);
    setBulkError(null);
    const ids = [...selected];
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await api.updateTransaction(token, id, { categoryLabel: bulkCat });
      } catch (e) {
        failed.push(e instanceof Error ? e.message : 'failed');
      }
    }
    setBulkBusy(false);
    const ok = ids.length - failed.length;
    toast(`Moved ${ok} ${ok === 1 ? 'entry' : 'entries'} to ${bulkCat}`);
    if (failed.length) setBulkError(`${failed.length} could not be changed: ${failed[0]}`);
    else setSelected(new Set());
    await refresh(['core', 'budgets', 'insights']);
  };

  return (
    <>
      <PageHead title="Activity" sub={uncat ? `${total} without category` : result ? `${total} entries${filtered ? ' match' : ''}` : '…'}>
        <a className="btn" href={href('import')}>Import statement</a>
        <button className="btn primary" onClick={() => setEditor(null)}>+ New entry</button>
      </PageHead>

      <div className="stack filters">
        <div className="row wrap" style={{ gap: 10 }}>
          <input className="input" type="search" style={{ flex: '1 1 240px', maxWidth: 420 }} placeholder="Search notes and categories…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
          <button className="btn sm hide-lg" onClick={() => setMore((m) => !m)} aria-expanded={more}>Filters{filtered ? ' •' : ''}</button>
          <div className="hide-sm"><Chips options={PERIODS} value={period} onChange={(p) => { if (p === 'custom' && !from) { setFrom(isoDay(resolveRange('month').from)); setTo(isoDay(new Date())); } setPeriod(p); setPage(0); }} /></div>
        </div>
        <div className={`row wrap filter-more ${more ? 'open' : ''}`} style={{ gap: 10 }}>
          <div className="show-sm-block" style={{ width: '100%' }}><Chips options={PERIODS} value={period} onChange={(p) => { if (p === 'custom' && !from) { setFrom(isoDay(resolveRange('month').from)); setTo(isoDay(new Date())); } setPeriod(p); setPage(0); }} /></div>
          {period === 'custom' ? (
            <span className="row" style={{ gap: 6 }}>
              <input className="input" style={{ width: 150 }} type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
              <span className="faint">→</span>
              <input className="input" style={{ width: 150 }} type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
            </span>
          ) : null}
          <Chips options={KINDS as unknown as { key: string; label: string }[]} value={kind} onChange={(k) => { setKind(k as typeof kind); setPage(0); }} />
          <select className="input" style={{ width: 'auto' }} value={account} onChange={(e) => { setAccount(e.target.value); setPage(0); }} aria-label="Account">
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
          </select>
          <select className="input" style={{ width: 'auto', maxWidth: 220 }} value={uncat ? '__none' : category} aria-label="Category" onChange={(e) => {
            const v = e.target.value;
            if (v === '__none') navigate('activity', { uncat: '1' });
            else { if (uncat) navigate('activity', v ? { category: v } : undefined); setCategory(v); setPage(0); }
          }}>
            <option value="">All categories</option>
            <option value="__none">Uncategorised</option>
            {[...categories].sort((a, b) => a.label.localeCompare(b.label)).map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
          </select>
          <span className="row" style={{ gap: 4 }}>
            <input className="input num" style={{ width: 84 }} inputMode="decimal" placeholder="min" value={min} onChange={(e) => { setMin(e.target.value); setPage(0); }} aria-label="Minimum amount" />
            <span className="faint">–</span>
            <input className="input num" style={{ width: 84 }} inputMode="decimal" placeholder="max" value={max} onChange={(e) => { setMax(e.target.value); setPage(0); }} aria-label="Maximum amount" />
          </span>
          <button className="chip" onClick={() => setSort(sort === 'date' ? 'amount' : 'date')}>Sort: {sort === 'date' ? 'newest' : 'largest'}</button>
          {filtered ? <button className="link small" onClick={reset}>Clear filters</button> : null}
        </div>
        {sums ? (
          <div className="row small wrap" style={{ gap: 16 }}>
            <span className="muted">in <strong className="num money pos">{formatAmount(sums.income)}</strong></span>
            <span className="muted">out <strong className="num money neg">{formatAmount(sums.expense)}</strong></span>
            <span className="muted">net <strong className={`num money ${sums.income - sums.expense < 0 ? 'neg' : 'pos'}`}>{formatSigned(sums.income - sums.expense)}</strong></span>
            {uncat ? <span className="tag accent">uncategorised only</span> : null}
          </div>
        ) : null}
      </div>

      {selected.size ? (
        <div className="bulkbar fade-in">
          <strong>{selected.size} selected</strong>
          <span className="faint small hide-sm">Move to</span>
          <div style={{ minWidth: 180, flex: '1 1 180px', maxWidth: 280 }}>
            <CategorySelect categories={categories} value={bulkCat} onChange={setBulkCat} allowEmpty="Category…" />
          </div>
          <button className="btn primary sm" onClick={applyBulk} disabled={!bulkCat || bulkBusy}>{bulkBusy ? 'Saving…' : 'Recategorise'}</button>
          <button className="btn ghost sm" onClick={() => setSelected(new Set())}>Clear</button>
          <ErrorLine>{bulkError}</ErrorLine>
        </div>
      ) : null}

      <Section span="" title={busy ? 'Loading…' : uncat ? 'Without category' : `Page ${page + 1} of ${totalPages}`} action={
        <span className="row" style={{ gap: 10 }}>
          <label className="switch small"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((t) => t.id)))} /><span>Select all</span></label>
          {totalPages > 1 ? (
            <>
              <button className="btn sm ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>← Newer</button>
              <button className="btn sm ghost" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>Older →</button>
            </>
          ) : null}
        </span>
      }>
        <TxList transactions={items} grouped={sort === 'date'} showBalance selected={selected} onToggle={toggle} onOpen={setEditor} empty={uncat ? 'Every entry has a category.' : 'Nothing matches these filters.'} />
        {totalPages > 1 ? (
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 14 }}>
            <button className="btn sm" disabled={page === 0} onClick={() => { setPage(page - 1); window.scrollTo({ top: 0 }); }}>← Newer</button>
            <span className="tiny faint">{page + 1} / {totalPages}</span>
            <button className="btn sm" disabled={page + 1 >= totalPages} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0 }); }}>Older →</button>
          </div>
        ) : null}
      </Section>

      {editor !== undefined ? <TransactionEditor editing={editor} onClose={() => setEditor(undefined)} presetAccountId={account || undefined} /> : null}
    </>
  );
}
