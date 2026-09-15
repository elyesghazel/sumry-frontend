import { useEffect, useRef, useState } from 'react';
import { api, type QuickEntry } from '../api';
import { href, useStore, type Page } from '../store';
import { CURRENCY, formatAmount, formatLongDate } from '../format';
import { Tag } from '../ui';

export const NAV: { key: Page; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'activity', label: 'Activity' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'budgets', label: 'Budgets' },
  { key: 'plan', label: 'Plan' },
  { key: 'insights', label: 'Insights' },
  { key: 'settings', label: 'Settings' },
];

const TAB_ICONS: Record<string, string> = {
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  activity: 'M4 6h16M4 12h16M4 18h10',
  plan: 'M8 3v3M16 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  insights: 'M4 19V9M10 19V5M16 19v-8M22 19H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z',
};

export function Topbar({ page, initialQuick }: { page: Page; initialQuick?: string }) {
  const { theme, setTheme, density, setDensity, privacy, setPrivacy, loading, refresh } = useStore();
  const [menu, setMenu] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="wordmark" href={href('home')}>Sumry</a>
        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.key} href={href(n.key)} aria-current={page === n.key ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          <QuickAdd initialText={initialQuick} />
          <button className="icon-btn hide-sm" title="Refresh" onClick={() => refresh()} disabled={loading} aria-label="Refresh">
            {loading ? <span className="spinner" /> : '↻'}
          </button>
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" aria-label="Display settings" onClick={() => setMenu((m) => !m)} title="Display">◐</button>
            {menu ? (
              <div className="quick-pop" style={{ left: 'auto', right: 0, width: 240 }} onMouseLeave={() => setMenu(false)}>
                <div className="caption" style={{ marginBottom: 6 }}>Theme</div>
                <div className="seg" style={{ marginBottom: 12 }}>
                  {(['system', 'light', 'dark'] as const).map((m) => (
                    <button key={m} aria-pressed={theme === m} onClick={() => setTheme(m)}>{m}</button>
                  ))}
                </div>
                <div className="caption" style={{ marginBottom: 6 }}>Density</div>
                <div className="seg" style={{ marginBottom: 12 }}>
                  {(['comfortable', 'compact'] as const).map((d) => (
                    <button key={d} aria-pressed={density === d} onClick={() => setDensity(d)}>{d}</button>
                  ))}
                </div>
                <label className="switch">
                  <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
                  <span>Blur amounts</span>
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export function BottomTabs({ page }: { page: Page }) {
  const items: Page[] = ['home', 'activity', 'plan', 'insights', 'settings'];
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map((k) => (
        <a key={k} href={href(k)} aria-current={page === k ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={TAB_ICONS[k]} />
          </svg>
          {NAV.find((n) => n.key === k)?.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * One field for "12.50 kebab cash yesterday". Parses as you type (debounced), shows what
 * it understood, books on Enter when nothing is missing. ⌘K / Ctrl+K focuses it.
 */
export function QuickAdd({ initialText }: { initialText?: string }) {
  const { token, refresh, toast } = useStore();
  const [text, setText] = useState(initialText ?? '');
  const [preview, setPreview] = useState<QuickEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(Boolean(initialText));
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!token || !text.trim()) {
      setPreview(null);
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        setPreview(await api.quick(token, text, false));
      } catch {
        setPreview(null);
      }
    }, 260);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [text, token]);

  const book = async () => {
    if (!token || !preview?.ready || busy) return;
    setBusy(true);
    try {
      const r = await api.quick(token, text, true);
      const p = r.parsed;
      toast(
        p.kind === 'TRANSFER_OUT'
          ? `Moved ${formatAmount(p.amount ?? 0)} ${p.accountName} → ${p.toAccountName}`
          : `${p.kind === 'INCOME' ? '+' : '−'}${formatAmount(p.amount ?? 0)} · ${p.categoryLabel} · ${p.accountName}`,
      );
      setText('');
      setPreview(null);
      setOpen(false);
      inputRef.current?.blur();
      await refresh(['core', 'planned', 'budgets', 'insights']);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not book');
    } finally {
      setBusy(false);
    }
  };

  const p = preview?.parsed;
  return (
    <div className="quick">
      <span className="faint" aria-hidden>＋</span>
      <input
        ref={inputRef}
        value={text}
        placeholder="12.50 kebab cash yesterday"
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') book();
          if (e.key === 'Escape') { setText(''); inputRef.current?.blur(); }
        }}
        aria-label="Quick add"
      />
      {!text ? <span className="kbd hide-sm">⌘K</span> : busy ? <span className="spinner" /> : null}
      {open && text.trim() && p ? (
        <div className="quick-pop" onMouseDown={(e) => e.preventDefault()}>
          <div className="row-between">
            <div>
              <span className={`serif money ${p.kind === 'INCOME' ? 'pos' : ''}`} style={{ fontSize: 22 }}>
                {p.amount === null ? '—' : `${p.kind === 'INCOME' ? '+' : p.kind === 'TRANSFER_OUT' ? '' : '−'}${formatAmount(p.amount)}`}
              </span>
              <span className="faint small" style={{ marginLeft: 6 }}>{CURRENCY}</span>
            </div>
            <span className="small muted">{formatLongDate(p.date)}</span>
          </div>
          <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
            {p.kind === 'TRANSFER_OUT' ? (
              <Tag>{p.accountName ?? '?'} → {p.toAccountName ?? '?'}</Tag>
            ) : (
              <>
                <Tag tone={p.categoryLabel ? '' : 'neg'}>{p.categoryLabel ?? 'no category'}{p.categorySource === 'rule' ? ' · rule' : ''}</Tag>
                <Tag>{p.accountName ?? 'no account'}</Tag>
              </>
            )}
            {p.description ? <span className="small muted truncate">“{p.description}”</span> : null}
          </div>
          <div className="row-between" style={{ marginTop: 10 }}>
            <span className="tiny faint">
              {preview.ready ? 'Enter to book' : `Missing: ${preview.missing.join(', ')}`}
            </span>
            <button className="btn primary sm" disabled={!preview.ready || busy} onClick={book}>Book</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
