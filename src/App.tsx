import { useCallback, useEffect, useMemo, useState } from 'react';
import { StoreProvider, useRoute, useStore } from './store';
import { Login } from './pages/Login';
import { Today } from './pages/Today';
import { Activity } from './pages/Activity';
import { Import } from './pages/Import';
import { Plan } from './pages/Plan';
import { Insights } from './pages/Insights';
import { Settings } from './pages/Settings';
import { AccountDetail } from './pages/AccountDetail';
import { BottomTabs, MobileTop, NAV, Palette, ShellContext, Sidebar, useGoKeys, type ShellApi } from './components/Nav';
import { TransactionEditor } from './components/Editor';

const TITLES: Record<string, string> = { import: 'Import', account: 'Account', settings: 'Settings' };

function Shell() {
  const { status, error, accounts } = useStore();
  const [route] = useRoute();
  const [palette, setPalette] = useState<{ text?: string } | null>(null);
  const [entry, setEntry] = useState<{ preset?: string } | null>(null);

  // A share from the phone (PWA share target) arrives as ?share=… on the URL; hand it to the palette.
  const shared = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const text = [p.get('title'), p.get('text'), p.get('url')].filter(Boolean).join(' ').trim();
    return text || undefined;
  }, []);
  useEffect(() => {
    if (!shared) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    setPalette({ text: shared });
  }, [shared]);

  const openPalette = useCallback(() => setPalette({}), []);
  const shell = useMemo<ShellApi>(() => ({ openPalette, newEntry: (preset) => setEntry({ preset }) }), [openPalette]);
  useGoKeys(openPalette);

  const accountId = route.page === 'account' ? route.params.get('id') : null;
  useEffect(() => {
    const label = NAV.find((n) => n.key === route.page)?.label ?? TITLES[route.page];
    const acct = accountId ? accounts.find((a) => a.id === accountId)?.accountName : null;
    document.title = route.page === 'today' ? 'Sumry' : `${acct ?? label} · Sumry`;
    window.scrollTo({ top: 0 });
  }, [route.page, accountId, accounts]);

  if (status === 'loading') {
    return (
      <div className="login-wrap">
        <div className="spinner" />
      </div>
    );
  }
  if (status === 'offline') return <Offline />;
  if (status === 'signed-out') return <Login />;

  return (
    <ShellContext.Provider value={shell}>
      <div className="app">
        <Sidebar page={route.page} accountId={accountId} />
        <div className="app-main">
          <MobileTop onPalette={openPalette} />
          <main className="page">
            {error ? <div className="panel neg small">{error}</div> : null}
            {route.page === 'today' ? <Today /> : null}
            {route.page === 'activity' ? <Activity route={route} /> : null}
            {route.page === 'import' ? <Import route={route} /> : null}
            {route.page === 'plan' ? <Plan route={route} /> : null}
            {route.page === 'insights' ? <Insights route={route} /> : null}
            {route.page === 'settings' ? <Settings route={route} /> : null}
            {route.page === 'account' ? <AccountDetail route={route} /> : null}
          </main>
        </div>
      </div>
      <BottomTabs page={route.page} onAdd={openPalette} />
      {palette ? <Palette initialText={palette.text} onClose={() => setPalette(null)} onNewEntry={() => setEntry({})} /> : null}
      {entry ? <TransactionEditor editing={null} presetAccountId={entry.preset} onClose={() => setEntry(null)} /> : null}
    </ShellContext.Provider>
  );
}

function Offline() {
  // Back online: start over, the stored session is checked again.
  useEffect(() => {
    const retry = () => window.location.reload();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);
  return (
    <div className="login-wrap">
      <div className="login">
        <p>Can't reach Sumry right now.</p>
        <p className="small" style={{ color: 'var(--ink-3)', margin: '8px 0 16px' }}>You are offline or the server is down. Your session is kept; this page retries when the connection is back.</p>
        <button className="btn" onClick={() => window.location.reload()}>Try again</button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
