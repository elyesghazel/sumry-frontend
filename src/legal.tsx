import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { LEGAL_DOCS, inlineText, isLegalResponse, parseMarkdown, type Block, type Inline, type LegalDoc } from '../core';

/**
 * Legal texts are instance config: the operator mounts `/legal/privacy.md` and
 * `/legal/imprint.md` next to the app. Without them nothing legal is shown anywhere.
 */
const cache = new Map<LegalDoc, Promise<string | null>>();

export function fetchLegal(doc: LegalDoc): Promise<string | null> {
  let p = cache.get(doc);
  if (!p) {
    p = fetch(LEGAL_DOCS[doc].file, { cache: 'no-cache' })
      .then(async (r) => (isLegalResponse(r.status, r.headers.get('content-type')) ? await r.text() : null))
      .then((text) => (text && text.trim() ? text : null))
      .catch(() => null);
    cache.set(doc, p);
  }
  return p;
}

/** Which legal files this instance serves; undefined while still checking. */
export function useLegal(): Record<LegalDoc, boolean> | undefined {
  const [found, setFound] = useState<Record<LegalDoc, boolean>>();
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLegal('privacy'), fetchLegal('imprint')]).then(([privacy, imprint]) => {
      if (!cancelled) setFound({ privacy: privacy != null, imprint: imprint != null });
    });
    return () => { cancelled = true; };
  }, []);
  return found;
}

/** Footer links to the legal pages that exist. Renders nothing on instances without them. */
export function LegalLinks({ className = 'tiny faint', style }: { className?: string; style?: CSSProperties }) {
  const found = useLegal();
  const docs = (Object.keys(LEGAL_DOCS) as LegalDoc[]).filter((d) => found?.[d]);
  if (!docs.length) return null;
  return (
    <p className={`legal-links ${className}`} style={style}>
      {docs.map((d, i) => (
        <span key={d}>
          {i > 0 ? ' · ' : null}
          <a className="link" href={LEGAL_DOCS[d].path}>{LEGAL_DOCS[d].label}</a>
        </span>
      ))}
    </p>
  );
}

export const legalDocForPath = (): LegalDoc | null => {
  const path = window.location.pathname.replace(/\/+$/, '');
  return (Object.keys(LEGAL_DOCS) as LegalDoc[]).find((d) => LEGAL_DOCS[d].path === path) ?? null;
};

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text': return n.text;
      case 'br': return <br key={i} />;
      case 'code': return <code key={i}>{n.text}</code>;
      case 'strong': return <strong key={i}>{renderInline(n.children)}</strong>;
      case 'em': return <em key={i}>{renderInline(n.children)}</em>;
      case 'link': {
        const external = /^https?:/i.test(n.href);
        return (
          <a key={i} className="link" href={n.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {renderInline(n.children)}
          </a>
        );
      }
    }
  });
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.type) {
    case 'heading': {
      const H = `h${b.level}` as 'h1';
      return <H key={i}>{renderInline(b.children)}</H>;
    }
    case 'paragraph': return <p key={i}>{renderInline(b.children)}</p>;
    case 'quote': return <blockquote key={i}>{renderInline(b.children)}</blockquote>;
    case 'rule': return <hr key={i} />;
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul';
      return <L key={i}>{b.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}</L>;
    }
  }
}

/** Markdown as React elements: raw HTML in the source is shown as text, never parsed. */
export function Markdown({ source }: { source: string }) {
  return <div className="prose">{parseMarkdown(source).map(renderBlock)}</div>;
}

/** Public page at `/privacy` or `/imprint`, signed in or out. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetchLegal(doc).then((t) => { if (!cancelled) setText(t); });
    return () => { cancelled = true; };
  }, [doc]);

  useEffect(() => {
    const first = text ? parseMarkdown(text).find((b) => b.type === 'heading') : undefined;
    const title = first && first.type === 'heading' ? inlineText(first.children) : LEGAL_DOCS[doc].label;
    document.title = `${title} · Sumry`;
  }, [doc, text]);

  return (
    <div className="legal-wrap">
      <header className="legal-head">
        <a href="/" className="wordmark">Sumry</a>
        <a href="/" className="link small">Back to Sumry</a>
      </header>
      {text === undefined ? <div className="spinner" /> : null}
      {text === null ? (
        <div className="fade-in">
          <h1>{LEGAL_DOCS[doc].label}</h1>
          <p className="muted" style={{ marginTop: 12 }}>This instance has not published one. Ask whoever runs it.</p>
        </div>
      ) : null}
      {text ? <article className="fade-in"><Markdown source={text} /></article> : null}
      <LegalLinks style={{ marginTop: 48 }} />
    </div>
  );
}
