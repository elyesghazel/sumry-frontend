import { describe, expect, it } from 'vitest';
import { inlineText, isLegalResponse, parseInline, parseMarkdown, safeHref } from '../../core';

describe('parseMarkdown', () => {
  it('parses headings, paragraphs, lists, quotes and rules', () => {
    const blocks = parseMarkdown('# Privacy\n\nWe keep\nyour data.\n\n- one\n- two\n\n1. first\n2) second\n\n> note\n\n---\n## Contact ##');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'rule', 'heading']);
    expect(blocks[1]).toEqual({ type: 'paragraph', children: [{ type: 'text', text: 'We keep your data.' }] });
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ text: 'one' }], [{ text: 'two' }]] });
    expect(blocks[3]).toMatchObject({ ordered: true });
    expect(blocks[6]).toMatchObject({ level: 2, children: [{ text: 'Contact' }] });
  });

  it('keeps raw HTML as text', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: '<script>alert(1)</script>' }] },
      { type: 'paragraph', children: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] },
    ]);
  });

  it('joins indented continuation lines into the list item', () => {
    const [list] = parseMarkdown('- a long\n  item\n- next');
    expect(list).toMatchObject({ items: [[{ text: 'a long item' }], [{ text: 'next' }]] });
  });

  it('handles CRLF and empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('a\r\nb')).toEqual([{ type: 'paragraph', children: [{ type: 'text', text: 'a b' }] }]);
  });
});

describe('parseInline', () => {
  it('parses bold, italic, code and links', () => {
    expect(parseInline('**b** *i* `c` [x](https://a.test)')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'i' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'link', href: 'https://a.test', children: [{ type: 'text', text: 'x' }] },
    ]);
  });

  it('drops unsafe link targets and keeps the label', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ type: 'text', text: 'click' }, { type: 'text', text: ')' }]);
    expect(parseInline('[x](data:text/html,hi)')).toEqual([{ type: 'text', text: 'x' }]);
  });

  it('autolinks and escapes', () => {
    expect(parseInline('<mailto:a@b.test>')).toEqual([{ type: 'link', href: 'mailto:a@b.test', children: [{ type: 'text', text: 'a@b.test' }] }]);
    expect(parseInline('\\*not em\\*')).toEqual([{ type: 'text', text: '*not em*' }]);
  });

  it('leaves underscores inside words alone', () => {
    expect(inlineText(parseInline('snake_case_name'))).toBe('snake_case_name');
  });

  it('turns two trailing spaces into a line break', () => {
    expect(parseInline('Street 1  \n8000 Zurich')).toEqual([
      { type: 'text', text: 'Street 1' }, { type: 'br' }, { type: 'text', text: '8000 Zurich' },
    ]);
  });
});

describe('safeHref', () => {
  it('allows web, mail, phone and same-site links only', () => {
    expect(safeHref('https://x.test')).toBe('https://x.test');
    expect(safeHref('mailto:a@b.test')).toBe('mailto:a@b.test');
    expect(safeHref('tel:+41000')).toBe('tel:+41000');
    expect(safeHref('/imprint')).toBe('/imprint');
    expect(safeHref('#top')).toBe('#top');
    expect(safeHref('//evil.test')).toBeNull();
    expect(safeHref('JavaScript:alert(1)')).toBeNull();
    expect(safeHref('vbscript:x')).toBeNull();
  });
});

describe('isLegalResponse', () => {
  it('accepts a 200 that is not the HTML shell', () => {
    expect(isLegalResponse(200, 'text/markdown; charset=utf-8')).toBe(true);
    expect(isLegalResponse(200, 'text/plain')).toBe(true);
    expect(isLegalResponse(200, null)).toBe(true);
    expect(isLegalResponse(200, 'text/html')).toBe(false);
    expect(isLegalResponse(404, 'text/markdown')).toBe(false);
  });
});
