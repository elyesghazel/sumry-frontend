import { useMemo, useState } from 'react';
import { api, type Budget, type BudgetPeriod } from '../api';
import { categoryColor, href, useStore } from '../store';
import { Empty, ErrorLine, Field, Meter, Modal, Num, Section, Stat, Swatch, Switch, Tag } from '../ui';
import { CategorySelect } from '../components/Editor';
import { CURRENCY, formatAmount, formatShortDate } from '../format';

const PERIODS: { key: BudgetPeriod; label: string }[] = [
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
  { key: 'YEARLY', label: 'Yearly' },
];

export function Budgets() {
  const { budgets, progress, categories } = useStore();
  const [editing, setEditing] = useState<Budget | null | undefined>(undefined);
  const categoryByLabel = useMemo(() => new Map(categories.map((c) => [c.label, c])), [categories]);
  const byId = useMemo(() => new Map(progress.map((p) => [p.budgetId, p])), [progress]);

  const monthly = progress.filter((p) => p.period === 'MONTHLY');
  const totalLimit = monthly.reduce((s, p) => s + p.effectiveLimit, 0);
  const totalSpent = monthly.reduce((s, p) => s + p.spentAmount, 0);
  const over = progress.filter((p) => p.pace === 'over').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Budgets</h1>
          <p className="sub">{budgets.length ? `${budgets.length} budgets · ${over ? `${over} running hot` : 'all on track'}` : 'Set a cap per category and see the pace, not just the total.'}</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(null)}>+ Budget</button>
      </div>

      <div className="grid">
        {monthly.length ? (
          <Section span="span-12" title="Monthly envelopes">
            <div className="stats">
              <Stat label="Budgeted" value={<Num value={totalLimit} />} />
              <Stat label="Spent" value={<Num value={totalSpent} />} foot={<span className="tiny faint">{totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0}% of the envelopes</span>} />
              <Stat label="Left" value={<Num value={totalLimit - totalSpent} format={(v) => `${v < 0 ? '−' : ''}${formatAmount(v)}`} />} />
            </div>
          </Section>
        ) : null}

        {budgets.length ? budgets.map((b) => {
          const p = byId.get(b.id);
          const ratio = p && p.effectiveLimit > 0 ? p.spentAmount / p.effectiveLimit : 0;
          const color = categoryColor(b.categoryLabel, categoryByLabel.get(b.categoryLabel)?.color ?? b.categoryColor);
          return (
            <Section key={b.id} span="span-4" title={<span className="dot-row"><Swatch color={color} />{b.categoryLabel}</span>}
              action={<span className="row" style={{ gap: 6 }}>{p ? <Tag tone={p.pace === 'over' ? 'neg' : p.pace === 'under' ? 'pos' : ''}>{p.pace === 'over' ? 'over pace' : p.pace === 'under' ? 'under pace' : 'on pace'}</Tag> : null}<button className="btn sm ghost" onClick={() => setEditing(b)}>Edit</button></span>}>
              {p ? (
                <>
                  <div className="row-between" style={{ alignItems: 'baseline' }}>
                    <span className="serif money" style={{ fontSize: 30 }}>{formatAmount(p.spentAmount)}</span>
                    <span className="small muted">of <span className="num money">{formatAmount(p.effectiveLimit)}</span>{p.carry !== 0 ? <span className="tiny faint"> ({p.carry > 0 ? '+' : '−'}{formatAmount(p.carry)} carried)</span> : null}</span>
                  </div>
                  <div style={{ margin: '10px 0 8px' }}><Meter ratio={ratio} tone={p.pace === 'over' ? 'over' : p.pace === 'on' ? 'warn' : 'ok'} /></div>
                  <div className="row-between tiny faint">
                    <span>{formatShortDate(p.periodStart)} – {formatShortDate(p.periodEnd)} · {p.daysLeft} days left</span>
                    <span>{p.remaining >= 0 ? `${formatAmount(p.perDayLeft)}/day left` : `${formatAmount(-p.remaining)} over`}</span>
                  </div>
                  <div className="tiny" style={{ marginTop: 8 }}><a className="link" href={href('activity', { category: b.categoryLabel })}>Entries</a> · {b.period.toLowerCase()}{b.period === 'MONTHLY' && b.startDay !== 1 ? ` from the ${b.startDay}.` : ''}{b.rollover ? ' · rolls over' : ''}</div>
                </>
              ) : <Empty>…</Empty>}
            </Section>
          );
        }) : (
          <Section span="span-12"><Empty>No budgets yet. A budget on Lebensmittel or Restaurant is where most people start.</Empty></Section>
        )}
      </div>

      {editing !== undefined ? <BudgetEditor editing={editing} onClose={() => setEditing(undefined)} /> : null}
    </>
  );
}

function BudgetEditor({ editing, onClose }: { editing: Budget | null; onClose: () => void }) {
  const { token, categories, budgets, refresh, toast } = useStore();
  const taken = new Set(budgets.map((b) => b.categoryLabel));
  const [category, setCategory] = useState(editing?.categoryLabel ?? '');
  const [limit, setLimit] = useState(editing ? editing.limitAmount.toFixed(2) : '');
  const [period, setPeriod] = useState<BudgetPeriod>(editing?.period ?? 'MONTHLY');
  const [rollover, setRollover] = useState(editing?.rollover ?? false);
  const [startDay, setStartDay] = useState(String(editing?.startDay ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number.parseFloat(limit.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0 && category;

  const save = async () => {
    if (!token || !valid) return;
    setBusy(true); setError(null);
    try {
      const sd = Math.min(28, Math.max(1, Number.parseInt(startDay) || 1));
      if (editing) await api.updateBudget(token, editing.id, { limitAmount: value, period, rollover, startDay: sd });
      else await api.createBudget(token, { categoryLabel: category, maxAmount: value, period, rollover, startDay: sd });
      toast('Saved');
      await refresh(['budgets']);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!token || !editing || !window.confirm(`Remove the ${editing.categoryLabel} budget?`)) return;
    setBusy(true);
    try { await api.deleteBudget(token, editing.id); toast('Removed'); await refresh(['budgets']); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete'); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? `${editing.categoryLabel} budget` : 'New budget'} onClose={onClose} footer={<>
      {editing ? <button className="btn danger" onClick={remove} disabled={busy}>Remove</button> : null}
      <span className="grow" />
      <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      {!editing ? (
        <Field label="Category">
          <CategorySelect categories={categories.filter((c) => c.categoryType === 'EXPENSE' && !taken.has(c.label))} value={category} onChange={setCategory} allowEmpty="Choose…" />
        </Field>
      ) : null}
      <div className="field-row">
        <Field label={`Limit per period · ${CURRENCY}`} style={{ flex: '0 0 160px' }}>
          <input className="input serif num" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} autoFocus placeholder="600.00" />
        </Field>
        <Field label="Period" grow>
          <div className="seg">{PERIODS.map((p) => <button key={p.key} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</button>)}</div>
        </Field>
      </div>
      {period === 'MONTHLY' ? (
        <Field label="Month starts on day (1–28, e.g. payday)" style={{ maxWidth: 200 }}>
          <input className="input num" inputMode="numeric" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
        </Field>
      ) : null}
      <Switch checked={rollover} onChange={setRollover} label={<span>Roll over what is left (or overspent) into the next period</span>} />
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}
