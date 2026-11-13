import { useMemo, useState } from 'react';
import {
  type ImportPreview,
  type ReconcileOffer,
  type StatementFileKind,
  MAX_IMPORT_BYTES,
  formatAmount,
  formatShortDate,
  formatSigned,
  importFormatFor,
  maskIbansIn,
  reconcileOffer,
  splitImportWarnings,
  statementFileKind,
} from '../../core';
import { api } from '../api';
import { href, useStore, type Route } from '../store';
import { ErrorLine, Field, Section, Tag } from '../ui';
import { PageHead } from '../components/Nav';
import { AccountSelect, CategorySelect } from '../components/Editor';

type Picked = { name: string; kind: StatementFileKind; size: number; csv?: string; base64?: string };

const readAs = (f: File, how: 'text' | 'dataUrl') =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
    if (how === 'text') r.readAsText(f, 'utf-8');
    else r.readAsDataURL(f);
  });

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Statement import: pick a PDF, camt.053 XML or CSV, check the preview, book it, then
 * line the account up with what the statement says it closed at.
 */
export function Import({ route }: { route: Route }) {
  const { accounts, categories, token, refresh, toast } = useStore();
  const [accountId, setAccountId] = useState(route.params.get('account') ?? accounts.find((a) => a.spending !== false)?.id ?? accounts[0]?.id ?? '');
  const [file, setFile] = useState<Picked | null>(null);
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, { include: boolean; category: string }>>({});
  const [defExp, setDefExp] = useState('');
  const [defInc, setDefInc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ booked: number; skipped: string[] } | null>(null);
  const [offer, setOffer] = useState<ReconcileOffer | null>(null);
  const account = accounts.find((a) => a.id === accountId);

  const pick = async (f: File | null) => {
    setError(null); setPreview(null); setDone(null); setOffer(null);
    if (!f) return setFile(null);
    const kind = statementFileKind(f.name, f.type);
    if (!kind) return setError('That file type is not supported. Use a PDF statement, a camt.053 XML or a CSV export.');
    if (f.size > MAX_IMPORT_BYTES) return setError(`The file is ${kb(f.size)}; the limit is ${kb(MAX_IMPORT_BYTES)}.`);
    try {
      if (kind === 'csv') setFile({ name: f.name, kind, size: f.size, csv: await readAs(f, 'text') });
      else {
        const url = await readAs(f, 'dataUrl');
        setFile({ name: f.name, kind, size: f.size, base64: url.slice(url.indexOf(',') + 1) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file');
    }
  };

  const run = async () => {
    if (!token || !accountId) return;
    const csv = file?.csv ?? (paste.trim() ? paste : undefined);
    if (!file && !csv) return;
    setBusy(true); setError(null); setDone(null); setOffer(null);
    try {
      const p = await api.importPreview(
        token,
        file?.base64
          ? { accountId, format: importFormatFor(file.kind), fileBase64: file.base64, fileName: file.name }
          : { accountId, csv },
      );
      setPreview(p);
      const c: typeof choices = {};
      for (const r of p.rows) c[r.line] = { include: !r.duplicate, category: r.categoryLabel ?? '' };
      setChoices(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!token || !preview) return;
    const rows = preview.rows
      .filter((r) => choices[r.line]?.include)
      .map((r) => ({ line: r.line, date: r.date, description: maskIbansIn(r.description), amount: r.amount, kind: r.kind, categoryLabel: choices[r.line]?.category || null }));
    if (!rows.length) return;
    setBusy(true); setError(null);
    try {
      const res = await api.importCommit(token, { accountId: preview.accountId, rows, defaultExpenseCategory: defExp || null, defaultIncomeCategory: defInc || null });
      setDone({ booked: res.booked, skipped: res.skipped.map((s) => `line ${s.line}: ${s.reason}`) });
      toast(`Imported ${res.booked} entries`);
      await refresh(['core', 'budgets', 'insights', 'planned']);
      const fresh = (await api.accounts(token)).find((a) => a.id === preview.accountId);
      setOffer(fresh ? reconcileOffer(preview, fresh.currentBalance) : null);
      setPreview(null); setFile(null); setPaste('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const reconcile = async () => {
    if (!token || !offer || !done) return;
    setBusy(true);
    try {
      await api.reconcileAccount(token, accountId, offer.statementBalance, 'Abgleich Kontoauszug');
      toast(offer.matches ? 'Marked as checked' : `Balance set to ${formatAmount(offer.statementBalance)}`);
      setOffer(null);
      await refresh(['core']);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reconcile');
    } finally {
      setBusy(false);
    }
  };

  const split = useMemo(() => splitImportWarnings(preview?.warnings), [preview]);
  const selected = preview ? preview.rows.filter((r) => choices[r.line]?.include) : [];
  const missing = selected.filter((r) => !choices[r.line]?.category && !(r.kind === 'INCOME' ? defInc : defExp)).length;

  return (
    <>
      <PageHead title="Import statement" sub={<><a className="link" href={href('activity')}>Activity</a> · PDF (PostFinance), camt.053 XML or CSV, up to 10 MB</>} />

      <Section span="" title="1 · Pick a file">
        <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
          <Field label="Into account" style={{ minWidth: 200 }}><AccountSelect accounts={accounts} value={accountId} onChange={(v) => { setAccountId(v); setPreview(null); }} /></Field>
          <Field label="Statement file" grow>
            <input className="input" type="file" accept=".pdf,.xml,.csv,.txt,application/pdf,application/xml,text/xml,text/csv,text/plain" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </Field>
          <button className="btn primary" onClick={run} disabled={busy || !accountId || (!file && !paste.trim())}>{busy && !preview ? 'Reading…' : 'Preview'}</button>
        </div>
        {file ? <p className="small muted" style={{ marginTop: 8 }}><Tag>{file.kind.toUpperCase()}</Tag> {file.name} · {kb(file.size)}{account ? ` → ${account.accountName}` : ''}</p> : null}
        <button className="link small" style={{ marginTop: 10 }} onClick={() => setShowPaste((s) => !s)}>{showPaste ? 'Hide' : '…or paste CSV text'}</button>
        {showPaste ? (
          <textarea className="input" style={{ marginTop: 8 }} value={paste} onChange={(e) => { setPaste(e.target.value); setFile(null); }} placeholder="Datum;Avisierungstext;Gutschrift in CHF;Lastschrift in CHF;…" />
        ) : null}
        <p className="tiny faint" style={{ marginTop: 10 }}>Nothing is booked until you confirm. Entries already in Sumry for the same day and amount are flagged as duplicates. IBANs in booking texts are masked.</p>
        <ErrorLine>{error}</ErrorLine>
      </Section>

      {done ? (
        <section className="panel fade-in">
          <header className="panel-head"><h2>Imported</h2><Tag tone="pos">{done.booked} booked</Tag></header>
          {done.skipped.length ? <p className="small muted">Skipped {done.skipped.length}: {done.skipped.slice(0, 4).join(' · ')}</p> : null}
          {offer && account ? (
            <div className={`offer ${offer.matches ? '' : 'warn'}`}>
              {offer.matches ? (
                <>
                  <div>The statement closes at <strong className="num money">{formatAmount(offer.statementBalance)}</strong> {account.currency}, the same as {account.accountName} in Sumry.</div>
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <button className="btn primary sm" onClick={reconcile} disabled={busy}>Mark {account.accountName} as checked</button>
                    <button className="btn ghost sm" onClick={() => setOffer(null)}>Not now</button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    The statement closes at <strong className="num money">{formatAmount(offer.statementBalance)}</strong>, Sumry shows <strong className="num money">{formatAmount(offer.recordedBalance)}</strong> for {account.accountName}
                    {' '}(<span className={`num money ${offer.difference < 0 ? 'neg' : 'pos'}`}>{formatSigned(offer.difference)}</span>).
                  </div>
                  <p className="tiny faint" style={{ marginTop: 4 }}>Reconciling books the difference as an adjustment so the balance matches the bank.</p>
                  <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                    <button className="btn primary sm" onClick={reconcile} disabled={busy}>Reconcile to {formatAmount(offer.statementBalance)}</button>
                    <a className="btn sm" href={href('account', { id: accountId })}>Look at the account first</a>
                    <button className="btn ghost sm" onClick={() => setOffer(null)}>Not now</button>
                  </div>
                </>
              )}
            </div>
          ) : null}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <a className="btn sm" href={href('activity', { account: accountId })}>See the entries</a>
          </div>
        </section>
      ) : null}

      {preview ? (
        <Section span="" title="2 · Check and book" action={
          <button className="btn primary sm" onClick={commit} disabled={busy || !selected.length || missing > 0}>{busy ? 'Booking…' : `Book ${selected.length}`}</button>
        }>
          <div className="import-summary">
            <div><span className="caption">Format</span><span>{preview.format}</span></div>
            {preview.statementFrom || preview.statementTo ? <div><span className="caption">Period</span><span>{preview.statementFrom ? formatShortDate(preview.statementFrom) : '…'} – {preview.statementTo ? formatShortDate(preview.statementTo) : '…'}</span></div> : null}
            {preview.statementOpeningBalance != null ? <div><span className="caption">Opening</span><span className="num money">{formatAmount(preview.statementOpeningBalance)}</span></div> : null}
            {preview.statementClosingBalance != null ? <div><span className="caption">Closing</span><span className="num money">{formatAmount(preview.statementClosingBalance)}</span></div> : null}
            <div><span className="caption">New</span><span className="num">{preview.newCount}</span></div>
            <div><span className="caption">Duplicates</span><span className="num faint">{preview.duplicateCount}</span></div>
            <div><span className="caption">No category</span><span className={`num ${preview.uncategorisedCount ? 'accent' : ''}`}>{preview.uncategorisedCount}</span></div>
          </div>

          {split.notes.length ? <ul className="notes small muted">{split.notes.slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
          {split.diagnostics.map((d, i) => <DiagnosticsBlock key={i} text={d} />)}

          {preview.rows.length ? (
            <>
              <div className="row wrap" style={{ gap: 10, margin: '12px 0' }}>
                <Field label="Default for uncategorised spending" style={{ minWidth: 220 }}><CategorySelect categories={categories} type="EXPENSE" value={defExp} onChange={setDefExp} allowEmpty="— none —" /></Field>
                <Field label="Default for uncategorised income" style={{ minWidth: 220 }}><CategorySelect categories={categories} type="INCOME" value={defInc} onChange={setDefInc} allowEmpty="— none —" /></Field>
                {missing > 0 ? <span className="small neg" style={{ alignSelf: 'end' }}>{missing} selected rows still need a category</span> : null}
              </div>
              <div className="improws">
                <div className="improw head caption"><span /><span>Date</span><span>Text</span><span className="right">Amount</span><span>Category</span></div>
                {preview.rows.map((r) => {
                  const c = choices[r.line] ?? { include: false, category: '' };
                  const uncat = c.include && !c.category;
                  return (
                    <div key={r.line} className={`improw ${r.duplicate ? 'dupe' : ''} ${uncat ? 'uncat' : ''} ${c.include ? '' : 'off'}`}>
                      <input type="checkbox" checked={c.include} aria-label="Include" onChange={(e) => setChoices({ ...choices, [r.line]: { ...c, include: e.target.checked } })} />
                      <span className="faint small nowrap">{formatShortDate(r.date)}</span>
                      <span className="imptext">
                        <span className="truncate">{maskIbansIn(r.description)}</span>
                        <span className="row" style={{ gap: 4 }}>
                          {r.duplicate ? <Tag>duplicate</Tag> : null}
                          {r.categoryLabel && !r.duplicate ? <Tag tone="pos">rule</Tag> : null}
                          {r.currencyMismatch ? <Tag tone="neg">{r.currency}</Tag> : null}
                        </span>
                      </span>
                      <span className={`right amount money ${r.kind === 'INCOME' ? 'pos' : ''}`}>{r.kind === 'INCOME' ? '+' : '−'}{formatAmount(r.amount)}</span>
                      <span className="impcat">
                        <CategorySelect categories={categories} type={r.kind === 'INCOME' ? 'INCOME' : 'EXPENSE'} value={c.category} onChange={(v) => setChoices({ ...choices, [r.line]: { ...c, category: v } })} allowEmpty={r.kind === 'INCOME' && defInc ? `default (${defInc})` : r.kind === 'EXPENSE' && defExp ? `default (${defExp})` : '— pick —'} />
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="row-between" style={{ marginTop: 12 }}>
                <span className="small muted">{selected.length} of {preview.rows.length} selected</span>
                <button className="btn primary" onClick={commit} disabled={busy || !selected.length || missing > 0}>{busy ? 'Booking…' : `Book ${selected.length} entries`}</button>
              </div>
            </>
          ) : (
            <p className="small muted" style={{ marginTop: 12 }}>No bookings were found in this file.{split.diagnostics.length ? ' The block above shows what the parser saw.' : ''}</p>
          )}
        </Section>
      ) : null}
    </>
  );
}

/** The backend's redacted parser output, ready to hand to whoever adapts the parser. */
function DiagnosticsBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="diag">
      <div className="row-between" style={{ marginBottom: 6 }}>
        <div>
          <strong className="small">Redacted diagnostics</strong>
          <span className="tag pos" style={{ marginLeft: 8 }}>safe to paste to an agent</span>
        </div>
        <button className="btn sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="tiny faint" style={{ marginBottom: 6 }}>Sumry could not read this layout. IBANs, account and card numbers, the holder's name and address were removed before this left the server; dates, amounts and booking texts stay so the parser can be fixed.</p>
      <pre className="mono">{text}</pre>
    </div>
  );
}
