/**
 * Conservative Markdown-to-React renderer.
 *
 * Security: output is composed exclusively of React elements and text nodes;
 * `dangerouslySetInnerHTML` is never used, so untrusted model/user content
 * cannot inject HTML. Links are restricted to http(s) URLs with noopener.
 *
 * Supported: fenced code blocks, headings (#..###), unordered/ordered lists,
 * blockquotes, horizontal rules, inline code, bold, italics, links.
 */

import type { ReactNode } from "react";
import { Fragment, type ReactElement } from "react";

const INLINE_PATTERN =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    const token = match[0];
    const tokenKey = `${keyPrefix}-${key++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={tokenKey}
          className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={tokenKey} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(<em key={tokenKey}>{token.slice(1, -1)}</em>);
    } else {
      // Link [label](http-url)
      const closeParen = token.lastIndexOf("](");
      const label = token.slice(1, closeParen);
      const href = token.slice(closeParen + 2, -1);
      nodes.push(
        <a
          key={tokenKey}
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {label}
        </a>,
      );
    }
    lastIndex = index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border">
      {language !== undefined && language.length > 0 ? (
        <div className="border-b border-border bg-muted px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {language}
        </div>
      ) : null}
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function renderMarkdown(source: string): ReactNode {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const nextKey = (): string => `md-${key++}`;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Fenced code block
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence !== null) {
      const language = fence[1];
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // skip closing fence (or EOF)
      blocks.push(
        <CodeBlock key={nextKey()} code={codeLines.join("\n")} language={language || undefined} />,
      );
      continue;
    }

    // Blank line
    if (line.trim().length === 0) {
      i += 1;
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const level = heading[1]?.length ?? 1;
      const sizes: Record<number, string> = {
        1: "text-base font-semibold",
        2: "text-sm font-semibold",
        3: "text-sm font-medium",
        4: "text-xs font-medium uppercase tracking-wide",
      };
      blocks.push(
        <p key={nextKey()} className={`mt-3 mb-1 first:mt-0 ${sizes[level] ?? sizes[3]}`}>
          {parseInline(heading[2] ?? "", nextKey())}
        </p>,
      );
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={nextKey()} className="my-3 border-border" />);
      i += 1;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("> ")) {
        quote.push((lines[i] ?? "").slice(2));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={nextKey()}
          className="my-2 border-l-2 border-accent/50 pl-3 text-muted-foreground"
        >
          {renderBlocksInline(quote)}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={nextKey()} className="my-1.5 list-disc space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`${nextKey()}-${itemIndex}`}>{parseInline(item, `${key}-li-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={nextKey()} className="my-1.5 list-decimal space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`${nextKey()}-${itemIndex}`}>{parseInline(item, `ol-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph: consume until blank line or block starter
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim().length > 0 &&
      !/^```/.test(lines[i] ?? "") &&
      !/^#{1,4}\s/.test(lines[i] ?? "") &&
      !/^\s*[-*]\s+/.test(lines[i] ?? "") &&
      !/^\s*\d+[.)]\s+/.test(lines[i] ?? "") &&
      !/^>\s/.test(lines[i] ?? "")
    ) {
      paragraph.push(lines[i] ?? "");
      i += 1;
    }
    if (paragraph.length === 0) {
      i += 1; // safety against pathological loops
      continue;
    }
    blocks.push(
      <p key={nextKey()} className="my-1.5 whitespace-pre-wrap first:mt-0">
        {parseInline(paragraph.join("\n"), nextKey())}
      </p>,
    );
  }

  return <>{blocks}</>;
}

/** Paragraph-only rendering for contexts like quotes. */
function renderBlocksInline(lines: readonly string[]): ReactElement {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? <br /> : null}
          {parseInline(line, `q-${index}`)}
        </Fragment>
      ))}
    </>
  );
}
