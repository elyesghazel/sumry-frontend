import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type QuickEntry,
  type Transaction,
  CURRENCY,
  formatAmount,
  formatDayHeading,
  formatLongDate,
  formatWhole,
  isAdmin,
  isTransfer,
  signOf,
} from '../../core';
import { api } from '../api';
import { href, navigate, useStore, type Page } from '../store';
import { Tag } from '../ui';
import { UpgradeEntry } from './Upgrade';

/** The five places. Account detail and Import live under them. */
export const NAV: { key: Page; label: string; key2: string; icon: string }[] = [
  { key: 'today', label: 'Today', key2: 'T', icon: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z' },
  { key: 'activity', label: 'Activity', key2: 'A', icon: 'M4 6h16M4 12h16M4 18h10' },
  { key: 'plan', label: 'Plan', key2: 'P', icon: 'M8 3v3M16 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z' },
  { key: 'insights', label: 'Insights', key2: 'I', icon: 'M5 20V10M12 20V4M19 20v-7' },
];

const GEAR =
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z';

const SHIELD = 'M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z';

/** Which nav item a page belongs to. */
export const sectionOf = (page: Page): Page => (page === 'import' ? 'activity' : page === 'account' ? 'today' : page);

export function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Left rail on wide screens: the four places, the accounts, settings at the bottom. */
export function Sidebar({ page, accountId }: { page: Page; accountId?: string | null }) {
  const { accounts, loading, refresh, privacy, setPrivacy, profile } = useStore();
  const section = sectionOf(page);
  return (
    <aside className="side" aria-label="Sections">
      <a className="wordmark" href={href('today')}>Sumry</a>
      <nav className="side-nav">
        {NAV.map((n) => (
          <a key={n.key} href={href(n.key)} aria-current={section === n.key && page !== 'account' ? 'page' : undefined}>
            <span className="row" style={{ gap: 9 }}><Icon d={n.icon} size={16} />{n.label}</span>
            <span className="kbd">G {n.key2}</span>
          </a>
        ))}
      </nav>
      <div className="side-sep" />
      <div className="caption side-caption">Accounts</div>
      <nav className="side-accounts">
        {accounts.map((a) => (
          <a key={a.id} href={href('account', { id: a.id })} aria-current={page === 'account' && accountId === a.id ? 'page' : undefined} className={a.spending === false ? 'savings' : ''}>
            <span className="truncate">{a.accountName}</span>
            <span className={`num money ${a.currentBalance < 0 ? 'neg' : ''}`}>{a.currentBalance < 0 ? '−' : ''}{formatWhole(a.currentBalance)}</span>
          </a>
        ))}
      </nav>
      <span className="grow" />
      <UpgradeEntry />
      <div className="side-sep" />
      <nav className="side-nav">
        <a href={href('settings')} aria-current={page === 'settings' ? 'page' : undefined}>
          <span className="row" style={{ gap: 9 }}><Icon d={GEAR} size={16} />Settings</span>
          <span className="kbd">G S</span>
        </a>
        {isAdmin(profile) ? (
          <a href={href('admin')} aria-current={page === 'admin' ? 'page' : undefined}>
            <span className="row" style={{ gap: 9 }}><Icon d={SHIELD} size={16} />Admin</span>
          </a>
        ) : null}
      </nav>
      <div className="row" style={{ gap: 4, padding: '6px 4px 0' }}>
        <button className="icon-btn" title="Refresh" aria-label="Refresh" onClick={() => refresh()} disabled={loading}>{loading ? <span className="spinner" /> : '↻'}</button>
        <button className="icon-btn" title={privacy ? 'Show amounts' : 'Blur amounts'} aria-label="Blur amounts" aria-pressed={privacy} onClick={() => setPrivacy(!privacy)}>{privacy ? '◌' : '◉'}</button>
      </div>
    </aside>
  );
}

/** Narrow screens: a slim bar with the wordmark, search and settings. */
export function MobileTop({ onPalette }: { onPalette: () => void }) {
  const { privacy, setPrivacy } = useStore();
  return (
    <header className="mtop">
      <a className="wordmark" href={href('today')}>Sumry</a>
      <span className="grow" />
      <button className="icon-btn" aria-label="Search" onClick={onPalette}><Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></button>
      <button className="icon-btn" aria-label={privacy ? 'Show amounts' : 'Blur amounts'} onClick={() => setPrivacy(!privacy)}>{privacy ? '◌' : '◉'}</button>
      <a className="icon-btn" href={href('settings')} aria-label="Settings"><Icon d={GEAR} /></a>
    </header>
  );
}

/** Phone tab bar: Today, Activity, +, Plan, Insights. */
export function BottomTabs({ page, onAdd }: { page: Page; onAdd: () => void }) {
  const section = sectionOf(page);
  const tab = (n: (typeof NAV)[number]) => (
    <a key={n.key} href={href(n.key)} aria-current={section === n.key ? 'page' : undefined}>
      <Icon d={n.icon} size={20} />
      {n.label}
    </a>
  );
  return (
    <nav className="tabs" aria-label="Sections">
      {tab(NAV[0])}
      {tab(NAV[1])}
      <button className="fab" onClick={onAdd} aria-label="Add">＋</button>
      {tab(NAV[2])}
      {tab(NAV[3])}
    </nav>
  );
}

/** What any page may ask of the shell: the palette and the new-entry form. */
export type ShellApi = { openPalette: () => void; newEntry: (presetAccountId?: string) => void };
export const ShellContext = createContext<ShellApi>({ openPalette: () => undefined, newEntry: () => undefined });
export const useShell = () => useContext(ShellContext);

/** Title row of a page; on wide screens it carries the ⌘K box on the right. */
export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  const { openPalette: onPalette } = useShell();
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      <div className="row wrap page-actions">
        {children}
        <PaletteTrigger onClick={onPalette} />
      </div>
    </div>
  );
}

export function PaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button className="palette-trigger hide-sm" onClick={onClick}>
      <span className="faint">Search or add “12.50 lunch”</span>
      <span className="kbd">⌘K</span>
    </button>
  );
}

/** `G` then a letter jumps to a place; `/` and ⌘K open the palette. Ignored while typing. */
export function useGoKeys(openPalette: () => void) {
  useEffect(() => {
    let armed = 0;
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('.modal')) return;
      const k = e.key.toLowerCase();
      if (k === '/') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (k === 'g') {
        armed = Date.now();
        return;
      }
      if (armed && Date.now() - armed < 1200) {
        armed = 0;
        const target: Record<string, Page> = { t: 'today', a: 'activity', p: 'plan', i: 'insights', s: 'settings' };
        if (target[k]) {
          e.preventDefault();
          navigate(target[k]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette]);
}

// ------------------------------------------------------------------ palette

type Item = { id: string; group: string; label: ReactNode; hint?: ReactNode; run: () => void; disabled?: boolean };

/**
 * ⌘K: one box for everything. "12.50 lunch" previews a quick entry (Enter books it), any
 * other text searches entries and places, and the empty box lists where to go and what to do.
 */
export function Palette({ initialText, onClose, onNewEntry }: { initialText?: string; onClose: () => void; onNewEntry: () => void }) {
  const { token, accounts, transactions, categories, refresh, toast, theme, setTheme } = useStore();
  const [text, setText] = useState(initialText ?? '');
  const [preview, setPreview] = useState<QuickEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const q = text.trim();
  const looksLikeEntry = /\d/.test(q);

  useEffect(() => {
    if (!token || !looksLikeEntry) {
      setPreview(null);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        setPreview(await api.quick(token, q, false));
      } catch {
        setPreview(null);
      }
    }, 220);
    return () => window.clearTimeout(id);
  }, [q, token, looksLikeEntry]);

  const book = async () => {
    if (!token || !preview?.ready || busy) return;
    setBusy(true);
    try {
      const r = await api.quick(token, q, true);
      const p = r.parsed;
      toast(
        p.kind === 'TRANSFER_OUT'
          ? `Moved ${formatAmount(p.amount ?? 0)} ${p.accountName} → ${p.toAccountName}`
          : `${p.kind === 'INCOME' ? '+' : '−'}${formatAmount(p.amount ?? 0)} · ${p.categoryLabel} · ${p.accountName}`,
      );
      onClose();
      await refresh(['core', 'planned', 'budgets', 'insights']);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not book');
    } finally {
      setBusy(false);
    }
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const lc = q.toLowerCase();
    const match = (s: string) => !lc || s.toLowerCase().includes(lc);
    const go = (page: Page, params?: Record<string, string>) => () => {
      navigate(page, params);
      onClose();
    };

    if (looksLikeEntry && preview) {
      const p = preview.parsed;
      out.push({
        id: 'add',
        group: 'Add',
        label: (
          <span className="row" style={{ gap: 8, minWidth: 0 }}>
            <strong className={`num money ${p.kind === 'INCOME' ? 'pos' : ''}`}>
              {p.amount === null ? '—' : `${p.kind === 'INCOME' ? '+' : p.kind === 'TRANSFER_OUT' ? '' : '−'}${formatAmount(p.amount)}`}
            </strong>
            {p.kind === 'TRANSFER_OUT' ? (
              <Tag>{p.accountName ?? '?'} → {p.toAccountName ?? '?'}</Tag>
            ) : (
              <>
                <Tag tone={p.categoryLabel ? '' : 'neg'}>{p.categoryLabel ?? 'no category'}{p.categorySource === 'rule' ? ' · rule' : ''}</Tag>
                <Tag>{p.accountName ?? 'no account'}</Tag>
              </>
            )}
            {p.description ? <span className="muted truncate">“{p.description}”</span> : null}
          </span>
        ),
        hint: preview.ready ? `${formatLongDate(p.date)} · Enter to book` : `Missing: ${preview.missing.join(', ')}`,
        run: book,
        disabled: !preview.ready,
      });
    }

    const places: [string, Page, Record<string, string>?][] = [
      ['Today', 'today'],
      ['Activity', 'activity'],
      ['Plan', 'plan'],
      ['Insights', 'insights'],
      ['Statement', 'insights', { tab: 'statement' }],
      ['Import statement', 'import'],
      ['Settings', 'settings'],
      ['Categories & rules', 'settings', { tab: 'categories' }],
      ['Export', 'settings', { tab: 'data' }],
      ['Apple Pay shortcut token', 'settings', { tab: 'shortcuts' }],
    ];
    for (const [label, page, params] of places) {
      if (match(label) || (lc.startsWith('go ') && match(lc.slice(3)) && label.toLowerCase().includes(lc.slice(3)))) {
        out.push({ id: `go:${label}`, group: 'Go to', label, run: go(page, params) });
      }
    }
    for (const a of accounts) {
      if (match(a.accountName)) {
        out.push({ id: `acct:${a.id}`, group: 'Accounts', label: a.accountName, hint: <span className="num money">{formatAmount(a.currentBalance)} {a.currency}</span>, run: go('account', { id: a.id }) });
      }
    }

    if (lc && !looksLikeEntry) {
      for (const c of categories) {
        if (c.label.toLowerCase().includes(lc)) out.push({ id: `cat:${c.id}`, group: 'Categories', label: c.label, hint: 'entries', run: go('activity', { category: c.label }) });
      }
      const hits: Transaction[] = [];
      for (const t of transactions) {
        if ((t.description ?? '').toLowerCase().includes(lc) || (t.categoryLabel ?? '').toLowerCase().includes(lc)) hits.push(t);
      }
      hits.sort((a, b) => b.date.localeCompare(a.date));
      for (const t of hits.slice(0, 6)) {
        const sign = signOf(t.kind);
        out.push({
          id: `tx:${t.id}`,
          group: 'Entries',
          label: <span className="truncate">{t.description || t.categoryLabel || 'Entry'} <span className="faint small">· {t.categoryLabel ?? (isTransfer(t.kind) ? 'Transfer' : 'Uncategorised')}</span></span>,
          hint: <span className="num money">{formatDayHeading(new Date(t.date))} · {sign > 0 ? '+' : '−'}{formatAmount(t.amount)}</span>,
          run: go('activity', { q: t.description ?? '' }),
        });
      }
      out.push({ id: 'search', group: 'Entries', label: <>Search all entries for “{q}”</>, hint: 'Activity', run: go('activity', { q }) });
    }

    const actions: [string, () => void][] = [
      ['New entry (form)', () => { onClose(); onNewEntry(); }],
      ['New planned item', go('plan', { new: 'planned' })],
      ['New budget', go('plan', { new: 'budget' })],
      ['New goal', go('plan', { new: 'goal' })],
      ...accounts.map((a): [string, () => void] => [`Reconcile ${a.accountName}`, go('account', { id: a.id, reconcile: '1' })]),
      [`Theme: ${theme === 'dark' ? 'light' : 'dark'}`, () => { setTheme(theme === 'dark' ? 'light' : 'dark'); onClose(); }],
    ];
    for (const [label, run] of actions) if (!looksLikeEntry && match(label)) out.push({ id: `act:${label}`, group: 'Actions', label, run });

    return out;
  }, [q, looksLikeEntry, preview, accounts, categories, transactions, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[active]; if (it && !it.disabled) it.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return (
    <div className="backdrop palette-backdrop" onClick={onClose}>
      <div className="palette fade-in" role="dialog" aria-modal="true" aria-label="Search or add" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <span className="faint" aria-hidden>⌕</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder="12.50 lunch · migros · go plan"
            aria-label="Search or add"
          />
          {busy ? <span className="spinner" /> : <span className="kbd">Esc</span>}
        </div>
        <div className="palette-list" ref={listRef}>
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? <div className="caption palette-group">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head}
                <button
                  data-i={i}
                  className={`palette-item ${i === active ? 'on' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => !it.disabled && it.run()}
                  aria-disabled={it.disabled}
                >
                  <span className="grow truncate">{it.label}</span>
                  {it.hint ? <span className="tiny faint" style={{ flex: '0 0 auto' }}>{it.hint}</span> : null}
                </button>
              </div>
            );
          })}
          {!items.length ? <div className="empty" style={{ padding: 16 }}>Nothing found. Type an amount to add an entry, e.g. “12.50 lunch”.</div> : null}
        </div>
        <div className="palette-foot tiny faint">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> move</span>
          <span><span className="kbd">Enter</span> run</span>
          <span><span className="kbd">G</span> then <span className="kbd">T</span>/<span className="kbd">A</span>/<span className="kbd">P</span>/<span className="kbd">I</span> jump</span>
          <span className="grow" />
          <span>{CURRENCY}</span>
        </div>
      </div>
    </div>
  );
}
