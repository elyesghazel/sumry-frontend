import { useMemo, useState } from 'react';
import {
  type NeedsYouItem,
  type Occurrence,
  type Transaction,
  CURRENCY,
  addDays,
  dailyAllowance,
  dayOf,
  formatAmount,
  formatShortDate,
  formatSigned,
  formatWhole,
  isoDay,
  mergePots,
  needsYou,
  projectBalance,
  relativeDays,
  resolveRange,
  startOfDay,
  totals,
} from '../../core';
import { api } from '../api';
import { categoryColor, href, navigate, useSnoozes, useStore } from '../store';
import { DeltaPercent, Empty, Meter, Num, Swatch, Tag } from '../ui';
import { PageHead, useShell } from '../components/Nav';
import { TxList } from '../components/TxList';
import { TransactionEditor } from '../components/Editor';
import { UpgradeBanner } from '../components/Upgrade';

/** Can I spend? Does anything need me? What's coming? In that order. */
export function Today() {
  const { accounts, transactions, upcoming, progress, budgets, goals, safe, forecast, token, refresh, toast } = useStore();
  const { newEntry } = useShell();
  const [editor, setEditor] = useState<Transaction | null>(null);
  const [snoozed, snooze] = useSnoozes();
  const now = new Date();

  const allowance = useMemo(() => dailyAllowance(safe, transactions), [safe, transactions]);
  const spendingAccounts = useMemo(() => {
    const ids = safe?.accountIds?.length ? new Set(safe.accountIds) : null;
    return accounts.filter((a) => (ids ? ids.has(a.id) : a.spending !== false));
  }, [accounts, safe]);
  const projection = useMemo(() => projectBalance(spendingAccounts, upcoming, 14), [spendingAccounts, upcoming]);

  const inbox = useMemo(
    () => needsYou({ accounts, transactions, upcoming, progress, budgets }).filter((i) => !snoozed.has(i.id)),
    [accounts, transactions, upcoming, progress, budgets, snoozed],
  );
  const pots = useMemo(() => mergePots(progress, goals).filter((p) => p.kind === 'budget').slice(0, 3), [progress, goals]);
  const month = useMemo(() => totals(transactions, resolveRange('month')), [transactions]);
  const netWorth = accounts.reduce((s, a) => s + (a.baseBalance ?? a.currentBalance ?? 0), 0);
  const recent = useMemo(() => [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), [transactions]);
  const todayKey = isoDay(now);
  const todaysCount = recent.filter((t) => dayOf(t.date) === todayKey).length;
  const next14 = useMemo(() => {
    const last = isoDay(addDays(startOfDay(now), 13));
    return upcoming.filter((o) => !o.overdue && dayOf(o.date) >= todayKey && dayOf(o.date) <= last);
  }, [upcoming, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const committed = safe ? safe.upcomingExpenses + safe.upcomingTransfersOut : 0;

  const act = async (label: string, fn: () => Promise<unknown>) => {
    if (!token) return;
    try {
      await fn();
      toast(label);
      await refresh(['core', 'planned', 'budgets', 'insights']);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed');
    }
  };
  const book = (o: Occurrence) => act(`Booked ${o.name}`, () => api.bookPlanned(token!, o.plannedId, isoDay(new Date())));
  const skip = (o: Occurrence) => act(`Skipped ${o.name}`, () => api.skipPlanned(token!, o.plannedId, dayOf(o.date)));
  const postpone = (o: Occurrence) => {
    const to = isoDay(addDays(new Date(), 7));
    return act(`${o.name} moved to ${formatShortDate(to)}`, () => api.postponePlanned(token!, o.plannedId, dayOf(o.date), to));
  };

  return (
    <>
      <PageHead title={greeting()} sub={now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} />
      <UpgradeBanner />

      <div className="today">
        <div className="today-main">
          {/* Can I spend? */}
          <section className="panel hero-panel fade-in">
            <header className="panel-head">
              <h2>Safe to spend today</h2>
              {safe ? <span className="tiny faint">until {safe.horizonReason || 'horizon'} · {formatShortDate(safe.horizon)}</span> : null}
            </header>
            {safe ? (
              <>
                <div className="hero-split">
                  <a href={href('plan')} className={`hero-value money ${allowance.over ? 'neg' : ''}`}>
                    <Num value={allowance.leftToday} format={formatSigned} />
                    <span className="unit">{CURRENCY}</span>
                  </a>
                  <div className="hero-side small">
                    <div><strong className="num money">{formatAmount(safe.safeToSpend)}</strong> <span className="muted">free till {safe.horizonReason || 'horizon'} · {safe.daysToHorizon} d</span></div>
                    <div className="faint">
                      <span className="num money">{formatAmount(safe.balance)}</span> on hand − <span className="num money">{formatAmount(committed)}</span> committed
                    </div>
                  </div>
                </div>
                <div className={`meter ${allowance.over ? 'over' : allowance.ratio > 0.85 ? 'warn' : 'ok'}`}>
                  <i style={{ width: `${Math.min(100, Math.max(allowance.spentToday > 0 ? 2 : 0, allowance.ratio * 100))}%` }} />
                </div>
                <div className="row-between small">
                  <span className="muted">
                    <span className="num money">{formatAmount(allowance.spentToday)}</span> of <span className="num money">{formatAmount(allowance.perDay)}</span> used today
                    {allowance.over ? <span className="neg"> · over by {formatAmount(-allowance.leftToday)}</span> : null}
                  </span>
                  <span className="faint hide-sm">{spendingAccounts.length < accounts.length ? 'savings left out' : ''}</span>
                </div>
              </>
            ) : <Empty>Loading…</Empty>}
          </section>

          {/* Account strip (phones; the sidebar lists them on wide screens). */}
          <div className="acct-strip show-sm-flex">
            {accounts.map((a) => (
              <a key={a.id} href={href('account', { id: a.id })} className={`acct ${a.spending !== false ? 'primary' : ''}`}>
                <span className="tiny faint truncate">{a.accountName}</span>
                <span className={`serif num money ${a.currentBalance < 0 ? 'neg' : ''}`}>{a.currentBalance < 0 ? '−' : ''}{formatAmount(a.currentBalance)}</span>
              </a>
            ))}
          </div>

          {/* Needs you sits here on phones, in the side column on wide screens. */}
          <div className="show-sm-block">
            <NeedsYou items={inbox} onBook={book} onSkip={skip} onPostpone={postpone} onSnooze={snooze} />
          </div>

          {/* What's coming? */}
          <section className="panel fade-in">
            <header className="panel-head">
              <h2>Next 14 days</h2>
              <a className="link small" href={href('plan')}>Plan →</a>
            </header>
            <WeekStrip occurrences={upcoming} />
            <ProjectionBars projection={projection} occurrences={next14} />
            {next14.length ? (
              <div className="list tight" style={{ marginTop: 10 }}>
                {next14.slice(0, 6).map((o) => (
                  <div className="row-between small" key={`${o.plannedId}-${o.date}`}>
                    <span className="dot-row" style={{ minWidth: 0 }}>
                      <span className="faint" style={{ width: 74, flex: '0 0 auto' }}>{relativeDays(o.date)}</span>
                      <Swatch color={o.kind === 'INCOME' ? 'var(--pos)' : o.categoryColor ?? 'var(--ink-3)'} />
                      <span className="truncate">{o.name}</span>
                      {o.autoBook ? <Tag>auto</Tag> : null}
                    </span>
                    <span className={`num money ${o.kind === 'INCOME' ? 'pos' : ''}`}>{o.kind === 'INCOME' ? '+' : o.kind === 'TRANSFER_OUT' ? '⇄ ' : '−'}{formatAmount(o.amount)}</span>
                  </div>
                ))}
                {next14.length > 6 ? <a className="tiny link" href={href('plan')}>{next14.length - 6} more in Plan</a> : null}
              </div>
            ) : null}
          </section>

          <section className="panel fade-in">
            <header className="panel-head">
              <h2>{todaysCount ? `Today · ${todaysCount}` : 'Recent'}</h2>
              <span className="row" style={{ gap: 10 }}>
                <button className="btn sm" onClick={() => newEntry()}>+ New</button>
                <a className="link small" href={href('activity')}>All activity →</a>
              </span>
            </header>
            <TxList transactions={recent} grouped onOpen={setEditor} empty="No entries yet. Press + or ⌘K and type “12.50 lunch”." />
          </section>
        </div>

        <div className="today-side">
          <div className="hide-sm">
            <NeedsYou items={inbox} onBook={book} onSkip={skip} onPostpone={postpone} onSnooze={snooze} />
          </div>

          <section className="panel fade-in">
            <header className="panel-head">
              <h2>Budgets · {now.toLocaleDateString(undefined, { month: 'long' })}</h2>
              <a className="link small" href={href('plan', { view: 'pots' })}>All →</a>
            </header>
            {pots.length ? (
              <div className="stack" style={{ gap: 12 }}>
                {pots.map((p) => (
                  <a key={p.id} href={href('plan', { pot: p.id })} className="block-link">
                    <div className="row-between small">
                      <span className="dot-row"><Swatch color={categoryColor(p.name, p.color)} />{p.name}</span>
                      <span className={`num money ${p.status === 'over' ? 'neg' : 'muted'}`}>{formatWhole(p.current)} / {formatWhole(p.target)}</span>
                    </div>
                    <div style={{ marginTop: 5 }}><Meter ratio={p.ratio} tone={p.status === 'over' ? 'over' : p.status === 'warn' ? 'warn' : 'ok'} /></div>
                    <div className="tiny faint" style={{ marginTop: 3 }}>
                      {p.remaining >= 0 ? `${formatAmount(p.remaining)} left · ${p.kind === 'budget' ? `${p.budget.daysLeft} d` : ''}` : <span className="neg">{formatAmount(-p.remaining)} over</span>}
                    </div>
                  </a>
                ))}
              </div>
            ) : <Empty>No budgets yet. <a className="link" href={href('plan', { new: 'budget' })}>Add one</a></Empty>}
          </section>

          <a className="panel block-link fade-in" href={href('insights')}>
            <header className="panel-head"><h2>Month end</h2>{forecast ? <Tag tone={forecast.verdict === 'over' ? 'neg' : forecast.verdict === 'under' ? 'pos' : ''}>{forecast.verdict === 'over' ? 'above usual' : forecast.verdict === 'under' ? 'below usual' : 'about usual'}</Tag> : null}</header>
            {forecast ? (
              <>
                <div className="row-between">
                  <span className="small muted">Projected net</span>
                  <span className={`serif num money ${forecast.projectedNet < 0 ? 'neg' : 'pos'}`} style={{ fontSize: 24 }}>{forecast.projectedNet < 0 ? '−' : '+'}{formatAmount(forecast.projectedNet)}</span>
                </div>
                <div className="row-between small" style={{ marginTop: 4 }}>
                  <span className="muted">Projected spend</span>
                  <span className="num money">{formatAmount(forecast.projectedSpend)}</span>
                </div>
                <div className="tiny faint" style={{ marginTop: 4 }}>
                  {formatAmount(forecast.spentSoFar)} so far · {forecast.daysLeft} days left · last month {formatAmount(forecast.lastMonthSpend)}
                </div>
              </>
            ) : <Empty>Loading…</Empty>}
          </a>

          <a className="panel block-link fade-in" href={href('insights')}>
            <header className="panel-head"><h2>Net worth</h2><span className="tiny faint">this month</span></header>
            <div className="serif num money" style={{ fontSize: 28, lineHeight: 1.1 }}>{formatAmount(netWorth)} <span className="tiny faint" style={{ fontFamily: 'var(--sans)' }}>{CURRENCY}</span></div>
            <div className="mini-stats">
              <div><span className="tiny faint">In</span><span className="num money pos">+{formatAmount(month.income)}</span></div>
              <div><span className="tiny faint">Out</span><span className="num money">−{formatAmount(month.expense)}</span></div>
              <div><span className="tiny faint">Net</span><span className={`num money ${month.net < 0 ? 'neg' : 'pos'}`}>{formatSigned(month.net)}</span></div>
            </div>
          </a>
        </div>
      </div>

      {editor ? <TransactionEditor editing={editor} onClose={() => setEditor(null)} /> : null}
    </>
  );
}

// ------------------------------------------------------------------ needs you

function NeedsYou({
  items,
  onBook,
  onSkip,
  onPostpone,
  onSnooze,
}: {
  items: NeedsYouItem[];
  onBook: (o: Occurrence) => void;
  onSkip: (o: Occurrence) => void;
  onPostpone: (o: Occurrence) => void;
  onSnooze: (id: string, days: number) => void;
}) {
  return (
    <section className="panel fade-in">
      <header className="panel-head">
        <h2>Needs you</h2>
        {items.length ? <span className="tag neg">{items.length}</span> : <span className="tag pos">clear</span>}
      </header>
      {items.length ? (
        <div className="inbox">
          {items.map((it) => (
            <InboxRow key={it.id} item={it} onBook={onBook} onSkip={onSkip} onPostpone={onPostpone} onSnooze={onSnooze} />
          ))}
        </div>
      ) : (
        <Empty>All clear. Nothing needs you right now.</Empty>
      )}
    </section>
  );
}

function InboxRow({
  item,
  onBook,
  onSkip,
  onPostpone,
  onSnooze,
}: {
  item: NeedsYouItem;
  onBook: (o: Occurrence) => void;
  onSkip: (o: Occurrence) => void;
  onPostpone: (o: Occurrence) => void;
  onSnooze: (id: string, days: number) => void;
}) {
  const snoozeBtn = (days: number, label = 'Later') => (
    <button className="btn sm ghost snooze" title={`Hide for ${days} day${days === 1 ? '' : 's'}`} onClick={() => onSnooze(item.id, days)}>{label}</button>
  );

  switch (item.kind) {
    case 'overdue': {
      const o = item.occurrence;
      return (
        <div className="it">
          <span className="dot" style={{ background: 'var(--neg)' }} />
          <div className="grow">
            <div className="truncate">{o.name} <span className="faint">· due {item.daysLate === 0 ? 'today' : item.daysLate === 1 ? 'yesterday' : `${item.daysLate} days ago`}</span></div>
            <div className="tiny faint">{o.kind === 'INCOME' ? '+' : '−'}{formatAmount(o.amount)} {o.currency} · {o.accountName}{o.toAccountName ? ` → ${o.toAccountName}` : ''}</div>
          </div>
          <div className="it-actions">
            <button className="btn sm primary" onClick={() => onBook(o)}>Book</button>
            <button className="btn sm" onClick={() => onSkip(o)}>Skip</button>
            <button className="btn sm" onClick={() => onPostpone(o)} title="Move to one week from today">+1 week</button>
          </div>
        </div>
      );
    }
    case 'uncategorised':
      return (
        <div className="it">
          <span className="dot" style={{ background: 'var(--accent)' }} />
          <div className="grow">
            <div>{item.count} {item.count === 1 ? 'entry' : 'entries'} without category</div>
            <div className="tiny faint num money">{formatAmount(item.total)} {CURRENCY} in total</div>
          </div>
          <div className="it-actions">
            <button className="btn sm" onClick={() => navigate('activity', { uncat: '1' })}>Sort</button>
            {snoozeBtn(3)}
          </div>
        </div>
      );
    case 'budgetOver':
      return (
        <div className="it">
          <span className="dot" style={{ background: 'var(--neg)' }} />
          <div className="grow">
            <div className="truncate">{item.budget.categoryLabel} over budget</div>
            <div className="tiny faint num money">{formatAmount(item.budget.spentAmount)} of {formatAmount(item.budget.effectiveLimit)} · {formatAmount(item.over)} over · {item.budget.daysLeft} d left</div>
          </div>
          <div className="it-actions">
            <button className="btn sm" onClick={() => navigate('plan', { pot: item.budget.budgetId })}>Open</button>
            {snoozeBtn(7)}
          </div>
        </div>
      );
    case 'reconcile':
      return (
        <div className="it">
          <span className="dot" style={{ background: 'var(--ink-3)' }} />
          <div className="grow">
            <div className="truncate">{item.account.accountName} {item.daysSince === null ? 'never checked' : `not checked for ${item.daysSince} d`}</div>
            <div className="tiny faint num money">Sumry shows {formatAmount(item.account.currentBalance)} {item.account.currency}</div>
          </div>
          <div className="it-actions">
            <button className="btn sm" onClick={() => navigate('account', { id: item.account.id, reconcile: '1' })}>{/cash|bar|portemonnaie/i.test(item.account.accountName) ? 'Count' : 'Check'}</button>
            {snoozeBtn(3)}
          </div>
        </div>
      );
    case 'monthClose': {
      const label = new Date(`${item.month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long' });
      return (
        <div className="it month-close">
          <span className="dot" style={{ background: 'var(--accent)' }} />
          <div className="grow">
            <div>{label} is closed: <strong className="num money">{formatAmount(item.spent)}</strong> spent <DeltaPercent value={item.change} invert label="vs month before" /></div>
            <div className="tiny faint">
              {item.topCategories.map((c) => `${c.label} ${formatWhole(c.value)}`).join(' · ')}
              {item.budgetsHit.length ? ` · budgets hit: ${item.budgetsHit.map((b) => b.categoryLabel).join(', ')}` : ' · no budget hit'}
            </div>
          </div>
          <div className="it-actions">
            <button className="btn sm" onClick={() => navigate('insights', { tab: 'statement', month: item.month })}>Statement</button>
            {snoozeBtn(30, 'Done')}
          </div>
        </div>
      );
    }
  }
}

// ------------------------------------------------------------------ coming up

/** Seven day cells with what is due on each; phones only. */
function WeekStrip({ occurrences }: { occurrences: Occurrence[] }) {
  const days = useMemo(() => {
    const start = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const key = isoDay(d);
      const due = occurrences.filter((o) => (i === 0 ? dayOf(o.date) <= key : dayOf(o.date) === key));
      const net = due.reduce((s, o) => s + (o.kind === 'INCOME' ? o.amount : o.kind === 'EXPENSE' ? -o.amount : 0), 0);
      return { d, key, due, net };
    });
  }, [occurrences]);
  const total = days.reduce((s, d) => s + d.net, 0);
  return (
    <div className="show-sm-block">
      <div className="row-between tiny faint" style={{ marginBottom: 6 }}><span>Next 7 days</span><span className="num money">{formatSigned(total)}</span></div>
      <div className="week">
        {days.map((d, i) => (
          <a key={d.key} className={`day ${i === 0 ? 'today' : ''}`} href={href('plan')}>
            {d.d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}
            <b>{d.d.getDate()}</b>
            {d.due.length ? <span className="pip" style={{ background: d.net > 0 ? 'var(--pos)' : d.due[0].categoryColor ?? 'var(--ink-2)' }} /> : null}
            {d.due.length ? <span className={`amt num money ${d.net > 0 ? 'pos' : ''}`}>{d.net > 0 ? '+' : d.net < 0 ? '−' : ''}{formatWhole(d.net)}</span> : null}
          </a>
        ))}
      </div>
    </div>
  );
}

/** Projected end-of-day balance of the spending accounts, the lowest day marked. */
function ProjectionBars({ projection, occurrences }: { projection: ReturnType<typeof projectBalance>; occurrences: Occurrence[] }) {
  const pts = projection.points;
  if (!pts.length) return null;
  const values = pts.map((p) => p.balance);
  // Scale from a floor below the lowest day so a dip is visible; zero stays the floor
  // once the line goes negative.
  const max = Math.max(...values);
  const lo = Math.min(...values);
  const min = lo < 0 ? lo : Math.max(0, lo - (max - lo) * 0.8 - Math.abs(max) * 0.05);
  const span = max - min || 1;
  const incomeDays = new Set(occurrences.filter((o) => o.kind === 'INCOME').map((o) => dayOf(o.date)));
  const firstIncome = occurrences.find((o) => o.kind === 'INCOME');
  return (
    <div className="proj">
      <div className="proj-bars" role="img" aria-label={`Projected balance, lowest ${formatAmount(projection.lowest.balance)} on ${formatShortDate(projection.lowest.date)}`}>
        {pts.map((p, i) => {
          const h = ((p.balance - min) / span) * 100;
          const cls = p.date === projection.lowest.date ? 'low' : incomeDays.has(p.date) ? 'in' : p.balance < 0 ? 'neg' : i === 0 ? 'now' : '';
          return (
            <span key={p.date} className={`proj-bar ${cls}`} style={{ height: `${Math.max(3, h)}%` }} title={`${formatShortDate(p.date)} · ${formatAmount(p.balance)} ${CURRENCY}`}>
              <i className="tiny">{new Date(`${p.date}T12:00:00`).getDate()}</i>
            </span>
          );
        })}
      </div>
      <div className="row-between tiny faint wrap" style={{ marginTop: 18, gap: 8 }}>
        <span>today <span className="num money">{formatWhole(pts[0].balance)}</span></span>
        <span className={projection.lowest.balance < 0 ? 'neg' : ''}>lowest <span className="num money">{projection.lowest.balance < 0 ? '−' : ''}{formatWhole(projection.lowest.balance)}</span> on {formatShortDate(projection.lowest.date)}</span>
        {firstIncome ? <span className="pos">+ {firstIncome.name} {formatShortDate(firstIncome.date)}</span> : <span>in 14 d <span className="num money">{formatWhole(pts[pts.length - 1].balance)}</span></span>}
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up?';
  if (h < 11) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
