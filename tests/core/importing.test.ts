import { describe, expect, it } from 'vitest';
import { importFormatFor, reconcileOffer, splitImportWarnings, statementFileKind } from '../../core';

describe('statementFileKind', () => {
  it('reads the extension first, then the mime type', () => {
    expect(statementFileKind('Kontoauszug.PDF')).toBe('pdf');
    expect(statementFileKind('camt053.xml')).toBe('xml');
    expect(statementFileKind('export.csv')).toBe('csv');
    expect(statementFileKind('statement', 'application/pdf')).toBe('pdf');
    expect(statementFileKind('photo.jpg', 'image/jpeg')).toBeNull();
  });

  it('maps a kind to the format sent to the backend', () => {
    expect(importFormatFor('pdf')).toBe('postfinance-pdf');
    expect(importFormatFor('xml')).toBe('camt053');
    expect(importFormatFor('csv')).toBe('auto');
  });
});

describe('splitImportWarnings', () => {
  it('separates the redacted diagnostics block from plain notes', () => {
    const block = 'Diagnostics, redacted (PDF text, first 2 of 2 lines):\nKontoinhaber: [hidden]\n01.11.26 Coop 12.50';
    const r = splitImportWarnings(['Line 4: no amount', block]);
    expect(r.notes).toEqual(['Line 4: no amount']);
    expect(r.diagnostics).toEqual([block]);
    expect(splitImportWarnings(undefined)).toEqual({ notes: [], diagnostics: [] });
  });
});

describe('reconcileOffer', () => {
  it('compares the closing balance with the account', () => {
    expect(reconcileOffer({ statementClosingBalance: null }, 10)).toBeNull();
    expect(reconcileOffer({ statementClosingBalance: 612.4 }, 600)).toEqual({
      statementBalance: 612.4,
      recordedBalance: 600,
      difference: 12.4,
      matches: false,
    });
    expect(reconcileOffer({ statementClosingBalance: 100.001 }, 100)?.matches).toBe(true);
  });
});
