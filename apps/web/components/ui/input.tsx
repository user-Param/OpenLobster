"use client";

import type { ReactNode } from "react";

const baseField =
  "w-full rounded-lg border bg-surface px-3 text-sm text-foreground placeholder:text-faint transition-colors focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-60";

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const TextInput = ({ invalid, className, ...rest }: TextInputProps) => (
  <input
    aria-invalid={invalid === true || undefined}
    className={`h-10 ${baseField} ${invalid ? "border-danger" : "border-border"} ${className ?? ""}`}
    {...rest}
  />
);

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const TextArea = ({ invalid, className, rows = 3, ...rest }: TextAreaProps) => (
  <textarea
    rows={rows}
    aria-invalid={invalid === true || undefined}
    className={`${baseField} resize-none py-2.5 leading-relaxed ${invalid ? "border-danger" : "border-border"} ${className ?? ""}`}
    {...rest}
  />
);

interface FieldProps {
  /** Visible label text. */
  label: string;
  /** id of the controlled input this label describes (required for a11y). */
  htmlFor: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}

/** Label + control + validation message, wired together for accessibility. */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  const errorId = `${htmlFor}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
      {hint !== undefined && (error === undefined || error === null) ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
      {error !== undefined && error !== null ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
