import { useEffect, useMemo, useState } from 'react';
import {
  type Budget,
  type Goal,
  type Occurrence,
  type Planned,
  type Pot,
  type Subscription,
  addDays,
  dayOf,
  formatAmount,
  formatLongDate,
  formatShortDate,
  formatSigned,
  formatWhole,
  isoDay,
  mergePots,
  relativeDays,
  startOfDay,
} from '../../core';
import { api } from '../api';
import { categoryColor, href, navigate, useStore, type Route } from '../store';
import { Empty, Meter, Modal, Num, Section, Segmented, Stat, Swatch, Tag } from '../ui';
import { PageHead } from '../components/Nav';
import { TxList } from '../components/TxList';
import { BudgetEditor, ContributeEditor, GoalEditor, PlannedEditor, PostponeEditor } from '../components/PlanEditors';

type View = 'list' | 'calendar';

/** What's ahead: due items you act on, the plans behind them, subscriptions and pots. */
export function Plan({ route }: { route: Route }) {
  const { planned, upcoming, goals, budgets, progress, subscriptions, safe, token, refresh, toast } = useStore();
  const [view, setView] = useState<View>('list');
  const [plannedEditor, setPlannedEditor] = useState<Planned | null | undefined>(undefined);
  const [prefill, setPrefill] = useState<Partial<Planned> | null>(null);
  const [goalEditor, setGoalEditor] = useState<Goal | null | undefined>(undefined);
  const [budgetEditor, setBudgetEditor] = useState<Budget | null | undefined>(undefined);
  const [contributing, setContributing] = useState<Goal | null>(null);
  const [postponing, setPostponing] = useState<Occurrence | null>(null);
  const [day, setDay] = useState<string | null>(null);

  const potId = route.params.get('pot');
  useEffect(() => {
    const n = route.params.get('new');
    if (n === 'planned') { setPrefill(null); setPlannedEditor(null); }
    if (n === 'budget') setBudgetEditor(null);
    if (n === 'goal') setGoalEditor(null);
    if (route.params.get('view') === 'pots') window.setTimeout(() => document.getElementById('pots')?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, [route]);
  const clearNew = () => { if (route.params.get('new')) navigate('plan'); };

  const pots = useMemo(() => mergePots(progress, goals), [progress, goals]);
  const pot = potId ? pots.find((p) => p.id === potId) ?? null : null;

  const active = planned.filter((p) => p.isActive);
  const monthlyOut = active.filter((p) => p.kind === 'EXPENSE').reduce((s, p) => s + p.monthlyEquivalent, 0);
  const monthlyIn = active.filter((p) => p.kind === 'INCOME').reduce((s, p) => s + p.monthlyEquivalent, 0);
  const monthlySave = active.filter((p) => p.kind === 'TRANSFER_OUT').reduce((s, p) => s + p.monthlyEquivalent, 0);
  const sorted = useMemo(() => [...planned].sort((a, b) => Number(b.isActive) - Number(a.isActive) || (a.nextDate ?? '9').localeCompare(b.nextDate ?? '9')), [planned]);

  const today = isoDay(new Date());
  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of upcoming) {
      const d = o.overdue || dayOf(o.date) < today ? 'overdue' : dayOf(o.date);
      m.set(d, [...(m.get(d) ?? []), o]);
    }
    return m;
  }, [upcoming, today]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    if (!token) return;
    try { await fn(); toast(label); await refresh(['core', 'planned', 'budgets', 'insights']); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed'); }
  };
  const book = (o: Occurrence) => act(`Booked ${o.name}`, () => api.bookPlanned(token!, o.plannedId, dayOf(o.date) < today ? today : dayOf(o.date)));
  const skip = (o: Occurrence) => act(`Skipped ${o.name} on ${formatShortDate(o.date)}`, () => api.skipPlanned(token!, o.plannedId, dayOf(o.date)));
  const planSubscription = (s: Subscription) => {
    setPrefill({ name: s.name, amount: s.medianAmount, frequency: s.interval === 'QUARTERLY' ? 'MONTHLY' : s.interval, categoryLabel: s.categoryLabel, accountId: s.accountId ?? undefined, startDate: s.nextExpected });
    setPlannedEditor(null);
  };

  const soonUntil = isoDay(addDays(new Date(), 7));
  const occRow = (o: Occurrence) => {
    // Due within a week: full actions. Further out: the same, but quiet.
    const soon = o.overdue || dayOf(o.date) <= soonUntil;
    return (
    <div className={`occ ${soon ? '' : 'later'}`} key={`${o.plannedId}-${o.date}`}>
      <span className="dot-row grow" style={{ minWidth: 0 }}>
        <Swatch color={o.kind === 'INCOME' ? 'var(--pos)' : o.kind === 'TRANSFER_OUT' ? 'var(--ink-3)' : o.categoryColor ?? 'var(--ink-3)'} />
        <span className="truncate">
          {o.name}
          <span className="tiny faint"> · {o.accountName}{o.toAccountName ? ` → ${o.toAccountName}` : ''}{o.categoryLabel ? ` · ${o.categoryLabel}` : ''}</span>
        </span>
        {o.autoBook ? <Tag>auto</Tag> : null}
      </span>
      <span className={`num money occ-amt ${o.kind === 'INCOME' ? 'pos' : ''}`}>{o.kind === 'INCOME' ? '+' : o.kind === 'TRANSFER_OUT' ? '⇄ ' : '−'}{formatAmount(o.amount)}</span>
      <span className="occ-actions">
        <button className={`btn sm ${soon ? 'primary' : 'ghost'}`} onClick={() => book(o)} title="Book it now">Book</button>
        <button className={`btn sm ${soon ? '' : 'ghost'}`} onClick={() => skip(o)} title="Let this one pass unbooked">Skip</button>
        <button className={`btn sm ${soon ? '' : 'ghost'}`} onClick={() => setPostponing(o)} title="Move this one to another day">Postpone</button>
      </span>
    </div>
    );
  };

  const dayKeys = [...byDay.keys()].sort((a, b) => (a === 'overdue' ? -1 : b === 'overdue' ? 1 : a.localeCompare(b)));
  const listDays = day ? dayKeys.filter((k) => k === day) : dayKeys;

  return (
    <>
      <PageHead title="Plan" sub="What is coming, what it is for, and what you are saving toward.">
        <button className="btn" onClick={() => setBudgetEditor(null)}>+ Budget</button>
        <button className="btn" onClick={() => setGoalEditor(null)}>+ Goal</button>
        <button className="btn primary" onClick={() => { setPrefill(null); setPlannedEditor(null); }}>+ Planned</button>
      </PageHead>

      <Section span="" title="Every month, on average">
        <div className="stats">
          <Stat label="Planned income" value={<Num value={monthlyIn} />} />
          <Stat label="Planned expenses" value={<Num value={monthlyOut} />} />
          <Stat label="Planned savings" value={<Num value={monthlySave} />} />
          <Stat label="Left for the rest" value={<Num value={monthlyIn - monthlyOut - monthlySave} format={formatSigned} />} foot={safe ? <span className="tiny faint">safe to spend now {formatAmount(safe.safeToSpend)}</span> : null} />
        </div>
      </Section>

      <div className="grid">
        <Section span="span-7" title={day ? `Due ${day === 'overdue' ? 'overdue' : formatLongDate(day)}` : 'Next 45 days'} action={
          <span className="row" style={{ gap: 8 }}>
            {day ? <button className="link small" onClick={() => setDay(null)}>Show all</button> : null}
            <Segmented options={[{ key: 'list', label: 'List' }, { key: 'calendar', label: 'Calendar' }]} value={view} onChange={(v) => setView(v as View)} />
          </span>
        }>
          {view === 'calendar' ? <Calendar byDay={byDay} selected={day} onSelect={(d) => setDay(d === day ? null : d)} /> : null}
          {listDays.length ? (
            <div className="occ-days">
              {listDays.map((k) => (
                <div key={k}>
                  <div className={`txday ${k === 'overdue' ? 'neg' : ''}`}>
                    <span>{k === 'overdue' ? 'Overdue' : `${relativeDays(k).replace(/^./, (c) => c.toUpperCase())} · ${formatShortDate(k)}`}</span>
                    <span className="num money">{formatSigned((byDay.get(k) ?? []).reduce((s, o) => s + (o.kind === 'INCOME' ? o.amount : o.kind === 'EXPENSE' ? -o.amount : 0), 0))}</span>
                  </div>
                  {(byDay.get(k) ?? []).map(occRow)}
                </div>
              ))}
            </div>
          ) : <Empty>{day ? 'Nothing due that day.' : 'Nothing due. Plans you add appear here as dated items.'}</Empty>}
        </Section>

        <Section span="span-5" title="Pots" action={<span className="tiny faint">budgets and goals</span>} className="pots-section">
          <div id="pots" />
          {pots.length ? (
            <div className="list">
              {pots.map((p) => <PotRow key={`${p.kind}:${p.id}`} pot={p} />)}
            </div>
          ) : <Empty>No budgets or goals yet. A budget on groceries or going out is where most people start.</Empty>}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn sm" onClick={() => setBudgetEditor(null)}>+ Budget</button>
            <button className="btn sm" onClick={() => setGoalEditor(null)}>+ Goal</button>
          </div>
        </Section>

        <Section span="span-7" title="Planned" action={<span className="tiny faint">{active.length} active</span>}>
          {planned.length ? (
            <div className="list">
              {sorted.map((p) => (
                <div key={p.id} className="plan-row click" onClick={() => { setPrefill(null); setPlannedEditor(p); }} style={{ opacity: p.isActive ? 1 : 0.5 }}>
                  <span className="dot-row grow" style={{ minWidth: 0 }}>
                    <Swatch color={p.kind === 'TRANSFER_OUT' ? 'var(--ink-3)' : p.kind === 'INCOME' ? 'var(--pos)' : categoryColor(p.categoryLabel ?? '', p.categoryColor)} />
                    <span className="truncate">
                      {p.name}
                      <span className="tiny faint"> · {p.frequency.toLowerCase()} · {p.kind === 'TRANSFER_OUT' ? `${p.accountName} → ${p.toAccountName}` : p.accountName}{p.nextDate ? ` · next ${relativeDays(p.nextDate)}` : ''}</span>
                    </span>
                    {p.autoBook ? <Tag>auto</Tag> : null}
                    {!p.isActive ? <Tag>paused</Tag> : null}
                  </span>
                  <span className="right">
                    <span className={`amount money ${p.kind === 'INCOME' ? 'pos' : ''}`}>{p.kind === 'INCOME' ? '+' : p.kind === 'TRANSFER_OUT' ? '' : '−'}{formatAmount(p.amount)}</span>
                    {p.frequency !== 'MONTHLY' && p.frequency !== 'ONCE' ? <div className="tiny faint num money">{formatAmount(p.monthlyEquivalent)}/mo</div> : null}
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty>Add rent, salary and the subscriptions you know about. “Safe to spend” on Today is built from these.</Empty>}
        </Section>

        <Section span="span-5" title="Subscriptions" action={subscriptions ? <span className="tiny faint num">{formatAmount(subscriptions.monthlyTotal)}/mo · {formatWhole(subscriptions.yearlyTotal)}/yr</span> : null}>
          {subscriptions?.subscriptions.length ? (
            <div className="list tight">
              {subscriptions.subscriptions.map((s) => (
                <div className="row-between" key={s.name}>
                  <span className="dot-row" style={{ minWidth: 0 }}>
                    <Swatch color={s.categoryColor ?? 'var(--ink-3)'} />
                    <span className="truncate" style={{ opacity: s.active ? 1 : 0.5 }}>{s.name}<span className="tiny faint"> · {s.interval.toLowerCase()} · next {formatShortDate(s.nextExpected)}</span></span>
                  </span>
                  <span className="row" style={{ gap: 8, flex: '0 0 auto' }}>
                    <span className="num money small">{formatAmount(s.medianAmount)}</span>
                    {s.planned ? <Tag tone="pos">planned</Tag> : s.active ? <button className="btn sm ghost" onClick={() => planSubscription(s)}>Plan it</button> : <Tag>ended</Tag>}
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty>Nothing recurring detected yet. This needs three or more payments of the same thing at a steady interval.</Empty>}
        </Section>
      </div>

      {pot ? (
        <PotDetail
          pot={pot}
          onClose={() => navigate('plan')}
          onEditBudget={() => setBudgetEditor(budgets.find((b) => b.id === pot.id) ?? null)}
          onEditGoal={(g) => setGoalEditor(g)}
          onContribute={(g) => setContributing(g)}
        />
      ) : null}
      {plannedEditor !== undefined ? <PlannedEditor editing={plannedEditor} prefill={prefill} onClose={() => { setPlannedEditor(undefined); setPrefill(null); clearNew(); }} /> : null}
      {goalEditor !== undefined ? <GoalEditor editing={goalEditor} onClose={() => { setGoalEditor(undefined); clearNew(); }} /> : null}
      {budgetEditor !== undefined ? <BudgetEditor editing={budgetEditor} onClose={() => { setBudgetEditor(undefined); clearNew(); }} /> : null}
      {contributing ? <ContributeEditor goal={contributing} onClose={() => setContributing(null)} /> : null}
      {postponing ? <PostponeEditor occurrence={postponing} onClose={() => setPostponing(null)} /> : null}
    </>
  );
}

function PotRow({ pot: p }: { pot: Pot }) {
  const tone = p.status === 'over' || p.status === 'behind' ? 'over' : p.status === 'warn' ? 'warn' : 'ok';
  return (
    <a className="block-link pot" href={href('plan', { pot: p.id })}>
      <div className="row-between">
        <span className="dot-row" style={{ minWidth: 0 }}>
          <Swatch color={categoryColor(p.name, p.color)} />
          <span className="truncate">{p.name}</span>
          <Tag>{p.kind === 'budget' ? p.budget.period.toLowerCase() : 'goal'}</Tag>
        </span>
        <span className={`num money small ${p.status === 'over' ? 'neg' : 'muted'}`}>{formatWhole(p.current)} / {formatWhole(p.target)}</span>
      </div>
      <div style={{ margin: '6px 0 3px' }}><Meter ratio={p.ratio} tone={p.kind === 'goal' ? (p.status === 'behind' ? 'warn' : 'ok') : tone} /></div>
      <div className="tiny faint">
        {p.kind === 'budget'
          ? p.remaining >= 0
            ? `${formatAmount(p.remaining)} left · ${formatAmount(p.budget.perDayLeft)}/day · ${p.budget.daysLeft} d`
            : <span className="neg">{formatAmount(-p.remaining)} over · {p.budget.daysLeft} d left</span>
          : p.status === 'done'
            ? 'reached'
            : `${Math.round(p.ratio * 100)}%${p.goal.targetDate ? ` · by ${formatShortDate(p.goal.targetDate)}` : ''}${p.goal.requiredPerMonth ? ` · ${formatAmount(p.goal.requiredPerMonth)}/mo needed` : ''}${p.status === 'behind' ? ' · behind' : ''}`}
      </div>
    </a>
  );
}

/** One pot in full: its numbers, and for a budget the entries that filled it. */
function PotDetail({ pot, onClose, onEditBudget, onEditGoal, onContribute }: { pot: Pot; onClose: () => void; onEditBudget: () => void; onEditGoal: (g: Goal) => void; onContribute: (g: Goal) => void }) {
  const { transactions } = useStore();
  const entries = useMemo(() => {
    if (pot.kind !== 'budget') return [];
    const b = pot.budget;
    return transactions
      .filter((t) => t.categoryLabel === b.categoryLabel && t.date.slice(0, 10) >= b.periodStart.slice(0, 10) && t.date.slice(0, 10) <= b.periodEnd.slice(0, 10))
      .sort((a, c) => c.date.localeCompare(a.date));
  }, [pot, transactions]);

  if (pot.kind === 'budget') {
    const b = pot.budget;
    return (
      <Modal title={`${b.categoryLabel} budget`} onClose={onClose} wide footer={<>
        <a className="btn ghost" href={href('activity', { category: b.categoryLabel })}>All entries</a>
        <span className="grow" />
        <button className="btn" onClick={onEditBudget}>Edit budget</button>
      </>}>
        <div className="row-between" style={{ alignItems: 'baseline' }}>
          <span className={`serif money ${pot.status === 'over' ? 'neg' : ''}`} style={{ fontSize: 34 }}>{formatAmount(b.spentAmount)}</span>
          <span className="small muted">of <span className="num money">{formatAmount(b.effectiveLimit)}</span>{b.carry ? <span className="tiny faint"> ({formatSigned(b.carry)} carried)</span> : null}</span>
        </div>
        <Meter ratio={pot.ratio} tone={pot.status === 'over' ? 'over' : pot.status === 'warn' ? 'warn' : 'ok'} />
        <div className="stats" style={{ marginTop: 6 }}>
          <Stat label={pot.remaining >= 0 ? 'Left' : 'Over'} value={formatAmount(Math.abs(pot.remaining))} />
          <Stat label="Per day left" value={formatAmount(b.perDayLeft)} foot={<span className="tiny faint">{b.daysLeft} days left</span>} />
          <Stat label="Pace" value={b.pace === 'over' ? 'Over' : b.pace === 'under' ? 'Under' : 'On'} foot={<span className="tiny faint">{formatShortDate(b.periodStart)} – {formatShortDate(b.periodEnd)}</span>} />
        </div>
        <div className="caption" style={{ marginTop: 6 }}>This period · {entries.length} entries</div>
        <TxList transactions={entries} grouped empty="Nothing spent in this category yet." />
      </Modal>
    );
  }
  const g = pot.goal;
  return (
    <Modal title={g.name} onClose={onClose} footer={<>
      <span className="grow" />
      <button className="btn" onClick={() => onEditGoal(g)}>Edit goal</button>
      <button className="btn primary" onClick={() => onContribute(g)} disabled={g.achieved}>Add money</button>
    </>}>
      <div className="row-between" style={{ alignItems: 'baseline' }}>
        <span className="serif money" style={{ fontSize: 34 }}>{formatAmount(g.current)}</span>
        <span className="small muted">of <span className="num money">{formatAmount(g.targetAmount)}</span></span>
      </div>
      <Meter ratio={pot.ratio} tone={g.onTrack === false ? 'warn' : 'ok'} />
      <div className="stats" style={{ marginTop: 6 }}>
        <Stat label="Still to save" value={formatAmount(Math.max(0, g.remaining))} />
        <Stat label="Needed / month" value={g.requiredPerMonth !== null ? formatAmount(g.requiredPerMonth) : '—'} foot={g.monthsLeft !== null ? <span className="tiny faint">{g.monthsLeft} months left</span> : null} />
        <Stat label="Status" value={g.achieved ? 'Reached' : g.onTrack === false ? 'Behind' : g.onTrack ? 'On track' : 'Open'} foot={g.targetDate ? <span className="tiny faint">by {formatLongDate(g.targetDate)}</span> : null} />
      </div>
      <p className="small muted">{g.accountName ? <>Tracks the balance of <a className="link" href={href('account', { id: g.accountId! })}>{g.accountName}</a>; adding money books a real transfer.</> : 'Keeps its own count; adding money raises the counter without booking anything.'}</p>
    </Modal>
  );
}

/** Five weeks from this Monday, with what is due on each day. */
function Calendar({ byDay, selected, onSelect }: { byDay: Map<string, Occurrence[]>; selected: string | null; onSelect: (d: string) => void }) {
  const start = startOfDay(new Date());
  const monday = addDays(start, -((start.getDay() + 6) % 7));
  const today = isoDay(start);
  const overdue = byDay.get('overdue') ?? [];
  const cells = Array.from({ length: 35 }, (_, i) => {
    const d = addDays(monday, i);
    const key = isoDay(d);
    const items = [...(byDay.get(key) ?? []), ...(key === today ? overdue : [])];
    const net = items.reduce((s, o) => s + (o.kind === 'INCOME' ? o.amount : o.kind === 'EXPENSE' ? -o.amount : 0), 0);
    return { d, key, items, net, past: key < today };
  });
  return (
    <div className="cal">
      {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((n) => <div key={n} className="cal-h tiny faint">{n}</div>)}
      {cells.map((c) => (
        <button key={c.key} className={`cal-day ${c.key === today ? 'today' : ''} ${c.past ? 'past' : ''} ${selected === c.key ? 'sel' : ''}`} onClick={() => !c.past && onSelect(c.key)} disabled={c.past}>
          <span className="cal-n">{c.d.getDate() === 1 ? c.d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : c.d.getDate()}</span>
          {c.items.slice(0, 3).map((o) => (
            <span key={`${o.plannedId}-${o.date}`} className={`cal-item truncate ${o.kind === 'INCOME' ? 'pos' : ''} ${o.overdue ? 'neg' : ''}`}>
              <i style={{ background: o.kind === 'INCOME' ? 'var(--pos)' : o.categoryColor ?? 'var(--ink-3)' }} />{o.name}
            </span>
          ))}
          {c.items.length > 3 ? <span className="tiny faint">+{c.items.length - 3}</span> : null}
          {c.items.length ? <span className={`cal-net num money ${c.net > 0 ? 'pos' : ''}`}>{c.net > 0 ? '+' : c.net < 0 ? '−' : ''}{formatWhole(c.net)}</span> : null}
        </button>
      ))}
    </div>
  );
}
