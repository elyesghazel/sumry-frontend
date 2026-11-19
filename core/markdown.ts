/**
 * A small markdown parser for operator-provided texts (privacy policy, imprint). It returns
 * a plain tree that the UI renders as elements, so raw HTML in the source stays text and
 * nothing is ever injected. Covers headings, paragraphs, lists, quotes, rules and the
 * inline marks bold, italic, code and links. Tables and nested lists are out of scope.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'br' };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'rule' };

/** Only web, mail and phone links, plus same-site paths and anchors. Anything else is dropped. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (/^(\/(?!\/)|#|\.\.?\/)/.test(href)) return href;
  return null;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (rest[0] === '\\' && rest.length > 1 && /[\\`*_[\]()#+\-.!]/.test(rest[1])) {
      text += rest[1];
      i += 2;
      continue;
    }
    if (rest[0] === '\n') {
      // Two trailing spaces or a backslash before a newline force a line break.
      if (/ {2,}$/.test(text)) {
        text = text.replace(/ +$/, '');
        flush();
        out.push({ type: 'br' });
      } else {
        text += ' ';
      }
      i += 1;
      continue;
    }
    let m = /^`([^`]+)`/.exec(rest);
    if (m) {
      flush();
      out.push({ type: 'code', text: m[1] });
      i += m[0].length;
      continue;
    }
    m = /^\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/.exec(rest);
    if (m) {
      flush();
      const href = safeHref(m[2]);
      const children = parseInline(m[1]);
      if (href) out.push({ type: 'link', href, children });
      else out.push(...children);
      i += m[0].length;
      continue;
    }
    m = /^<((?:https?:\/\/|mailto:)[^\s>]+)>/.exec(rest);
    if (m) {
      flush();
      out.push({ type: 'link', href: m[1], children: [{ type: 'text', text: m[1].replace(/^mailto:/, '') }] });
      i += m[0].length;
      continue;
    }
    m = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest);
    if (m) {
      flush();
      out.push({ type: 'strong', children: parseInline(m[2]) });
      i += m[0].length;
      continue;
    }
    m = /^(\*|_)(?=\S)([\s\S]*?\S)\1(?!\1)/.exec(rest);
    if (m && !(m[1] === '_' && /\w$/.test(text))) {
      flush();
      out.push({ type: 'em', children: parseInline(m[2]) });
      i += m[0].length;
      continue;
    }
    text += rest[0];
    i += 1;
  }
  flush();
  return out;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^ {0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^ {0,3}\d+[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const startsBlock = (line: string) => HEADING.test(line) || RULE.test(line) || BULLET.test(line) || NUMBERED.test(line) || QUOTE.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6, children: parseInline(heading[2]) });
      i += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const parts: string[] = [];
      let m: RegExpExecArray | null;
      while (i < lines.length && (m = QUOTE.exec(lines[i]))) {
        parts.push(m[1]);
        i += 1;
      }
      blocks.push({ type: 'quote', children: parseInline(parts.join('\n')) });
      continue;
    }
    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      const marker = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length) {
        const m = marker.exec(lines[i]);
        if (m) {
          items.push(m[1]);
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
          // An indented continuation line belongs to the previous item.
          items[items.length - 1] += `\n${lines[i].trim()}`;
        } else {
          break;
        }
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items: items.map(parseInline) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i]))) {
      para.push(lines[i].replace(/^ +/, ''));
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(para.join('\n')) });
  }
  return blocks;
}

/** The first top-level heading as plain text, for the page title. */
export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : n.type === 'br' ? ' ' : inlineText(n.children))).join('');
}

export type LegalDoc = 'privacy' | 'imprint';

export const LEGAL_DOCS: Record<LegalDoc, { path: string; file: string; label: string }> = {
  privacy: { path: '/privacy', file: '/legal/privacy.md', label: 'Privacy policy' },
  imprint: { path: '/imprint', file: '/legal/imprint.md', label: 'Imprint' },
};

/**
 * A served file counts only if it is a real 200 and not an HTML page: a dev server or an
 * SPA fallback answers missing paths with index.html, which must not show up as a policy.
 */
export function isLegalResponse(status: number, contentType: string | null): boolean {
  if (status !== 200) return false;
  return !/text\/html/i.test(contentType ?? '');
}
