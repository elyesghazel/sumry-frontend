import type { ImportFormat, ImportPreview } from './types';

/**
 * Statement import helpers shared by both apps: which kind of file was picked, how the
 * preview's warnings split into plain notes and the redacted diagnostics block, and
 * whether the account should be reconciled after a commit.
 */

/** Upload limit for a statement file (PDF, camt.053 XML or CSV). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export type StatementFileKind = 'csv' | 'pdf' | 'xml';

/** From the file name (and MIME type when the name has no extension); null when unsupported. */
export function statementFileKind(fileName: string, mimeType?: string | null): StatementFileKind | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'xml' || ext === '053') return 'xml';
  if (ext === 'csv' || ext === 'txt') return 'csv';
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('xml')) return 'xml';
  if (mime.startsWith('text/')) return 'csv';
  return null;
}

/** The `format` to send for a picked file: the backend sniffs CSVs itself. */
export function importFormatFor(kind: StatementFileKind): ImportFormat {
  return kind === 'pdf' ? 'postfinance-pdf' : kind === 'xml' ? 'camt053' : 'auto';
}

const DIAGNOSTICS = /^\s*diagnostics\b/i;

/** True for the redacted diagnostics block the backend adds when it could not read a file. */
export const isDiagnosticsWarning = (warning: string): boolean => DIAGNOSTICS.test(warning);

/**
 * Splits preview warnings into short notes and diagnostics blocks. The diagnostics are
 * already redacted by the backend (IBANs, account numbers, holder name and address), so a
 * UI may offer them for copying.
 */
export function splitImportWarnings(warnings: string[] | null | undefined): { notes: string[]; diagnostics: string[] } {
  const notes: string[] = [];
  const diagnostics: string[] = [];
  for (const w of warnings ?? []) (isDiagnosticsWarning(w) ? diagnostics : notes).push(w);
  return { notes, diagnostics };
}

export type ReconcileOffer = {
  /** What the statement says the account closed at. */
  statementBalance: number;
  /** What Sumry shows after the import. */
  recordedBalance: number;
  /** statementBalance − recordedBalance. */
  difference: number;
  /** The two agree to the cent: a reconcile only stamps "checked". */
  matches: boolean;
};

/**
 * After a commit: compare the statement's closing balance with the account. Null when the
 * statement carries no closing balance.
 */
export function reconcileOffer(
  preview: Pick<ImportPreview, 'statementClosingBalance' | 'statementTo'>,
  recordedBalance: number,
  today: Date = new Date(),
): ReconcileOffer | null {
  const closing = preview.statementClosingBalance;
  if (closing === null || closing === undefined || !Number.isFinite(closing)) return null;
  // An older statement closed at an older balance; reconciling today's account to it would
  // book a wrong adjustment. Only offer it when the statement ends within the last few days.
  if (preview.statementTo && !statementIsRecent(preview.statementTo, today)) return null;
  const difference = Math.round((closing - recordedBalance) * 100) / 100;
  return { statementBalance: closing, recordedBalance, difference, matches: Math.abs(difference) < 0.005 };
}

/** True when a statement ending on `to` (ISO date) is recent enough to compare with today's balance. */
export function statementIsRecent(to: string, today: Date = new Date(), days = 3): boolean {
  const end = new Date(`${to}T23:59:59`);
  return today.getTime() - end.getTime() <= days * 86_400_000;
}

/** The rows still unmatched, in the shape the Claude check expects. */
export function rowsForCheck(rows: ImportPreview['rows'], skip: Set<number> = new Set()) {
  return rows
    .filter((r) => !r.duplicate && !skip.has(r.line))
    .map((r) => ({ line: r.line, date: r.date, bookingDate: r.bookingDate ?? null, description: r.description, amount: r.amount, kind: r.kind }));
}
