"use client";

/**
 * Lightweight modal dialog: focus is moved into the panel on open, Escape
 * and backdrop clicks close it, background scroll is locked, and cleanup is
 * performed on unmount.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "@/components/icons";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Wider panels for content-heavy dialogs. */
  size?: "sm" | "md";
}

export function Dialog({ open, onClose, title, description, children, footer, size = "sm" }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog for keyboard users.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button:not([data-close-first])",
    );
    (focusable ?? panelRef.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 animate-fade-in sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${size === "sm" ? "max-w-md" : "max-w-2xl"} rounded-xl border border-border bg-elevated p-5 shadow-2xl animate-scale-in outline-none`}
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description !== undefined ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            data-close-first
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XIcon size={16} />
          </button>
        </div>
        {children !== undefined ? <div className="mt-3">{children}</div> : null}
        {footer !== undefined ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  );
}
