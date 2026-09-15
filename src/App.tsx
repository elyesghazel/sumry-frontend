import { useEffect, useMemo } from 'react';
import { StoreProvider, useRoute, useStore } from './store';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Activity } from './pages/Activity';
import { Accounts } from './pages/Accounts';
import { Budgets } from './pages/Budgets';
import { Plan } from './pages/Plan';
import { Insights } from './pages/Insights';
import { Settings } from './pages/Settings';
import { BottomTabs, NAV, Topbar } from './components/Topbar';

function Shell() {
  const { status, error } = useStore();
  const [route] = useRoute();

  // A share from the phone (PWA share target) arrives as ?share=… on the URL; hand it to quick add.
  const shared = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const text = [p.get('title'), p.get('text'), p.get('url')].filter(Boolean).join(' ').trim();
    return text || undefined;
  }, []);
  useEffect(() => {
    if (shared) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }, [shared]);

  useEffect(() => {
    const label = NAV.find((n) => n.key === route.page)?.label ?? 'Sumry';
    document.title = route.page === 'home' ? 'Sumry' : `${label} · Sumry`;
  }, [route.page]);

  if (status === 'loading') {
    return (
      <div className="login-wrap">
        <div className="spinner" />
      </div>
    );
  }
  if (status === 'signed-out') return <Login />;

  return (
    <>
      <Topbar page={route.page} initialQuick={shared} />
      <main className="page">
        {error ? <div className="panel neg small">{error}</div> : null}
        {route.page === 'home' ? <Home /> : null}
        {route.page === 'activity' ? <Activity route={route} /> : null}
        {route.page === 'accounts' ? <Accounts /> : null}
        {route.page === 'budgets' ? <Budgets /> : null}
        {route.page === 'plan' ? <Plan /> : null}
        {route.page === 'insights' ? <Insights /> : null}
        {route.page === 'settings' ? <Settings route={route} /> : null}
      </main>
      <BottomTabs page={route.page} />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
