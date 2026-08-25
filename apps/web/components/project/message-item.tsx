"use client";

import { LobsterMark } from "@/components/brand/logo";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown/render";
import type { ChatMessage } from "@/lib/api/types";

/**
 * A single conversation entry. Assistant content is rendered through the
 * conservative markdown renderer; user content is plain text. Both are safe
 * against HTML injection by construction.
 */
export function MessageItem({ message }: { message: ChatMessage }) {
  const time = formatRelativeTime(message.createdAt);

  if (message.role === "user") {
    return (
      <article className="flex justify-end" aria-label={`Your message, ${time}`}>
        <div
          title={formatDateTime(message.createdAt)}
          className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm leading-relaxed text-accent-foreground shadow-sm"
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </article>
    );
    }

  // assistant / system / tool messages all read as agent output.
  return (
    <article className="flex items-start gap-3" aria-label={`Agent message, ${time}`}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
        <LobsterMark size={16} />
      </span>
      <div className="min-w-0 max-w-[85%] flex-1 text-sm leading-relaxed text-foreground">
        <div
          title={formatDateTime(message.createdAt)}
          className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        >
          {renderMarkdown(message.content)}
        </div>
      </div>
    </article>
  );
}
