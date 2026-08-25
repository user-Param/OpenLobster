/**
 * OpenLobster brand mark and wordmark.
 * The mark is a minimal, geometric lobster — present but never cartoonish.
 */

interface MarkProps {
  size?: number;
  className?: string;
  /** Render in the brand accent (default) or inherit currentColor. */
  tone?: "accent" | "current";
}

export function LobsterMark({ size = 24, className, tone = "accent" }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      fill={tone === "accent" ? "var(--ol-accent)" : "currentColor"}
      aria-hidden
      focusable="false"
    >
      <path d="M14.4 6.2c-.9-1.8-2.7-3.1-4.9-3.4-.5-.1-.9.6-.5.9 1 .9 2.4 1.4 3.4 2.6z" />
      <path d="M17.6 6.2c.9-1.8 2.7-3.1 4.9-3.4.5-.1.9.6.5.9-1 .9-2.4 1.4-3.4 2.6z" />
      <circle cx="8.6" cy="10.4" r="3.1" />
      <circle cx="23.4" cy="10.4" r="3.1" />
      <rect x="9.8" y="12.2" width="3.2" height="4.6" rx="1.6" transform="rotate(18 11.4 14.5)" />
      <rect x="19" y="12.2" width="3.2" height="4.6" rx="1.6" transform="rotate(-18 20.6 14.5)" />
      <rect x="12.6" y="9.2" width="6.8" height="13.4" rx="3.4" />
      <path d="M16 21.4c2.5 0 4.4 1.9 4.9 4.6.1.5-.5.9-.9.5l-3.3-2.6a1.1 1.1 0 0 0-1.4 0l-3.3 2.6c-.4.3-1 0-.9-.5.5-2.7 2.4-4.6 4.9-4.6z" />
      <path
        d="M16 24.2c1.7 0 3 1.3 3.4 3.3.1.5-.5.8-.9.5l-2-1.6a.9.9 0 0 0-1 0l-2 1.6c-.4.3-1 0-.9-.5.4-2 1.7-3.3 3.4-3.3z"
        opacity=".75"
      />
    </svg>
  );
}

export function Logo({
  size = 22,
  withWordmark = true,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LobsterMark size={size} />
      {withWordmark ? (
        <span
          className="font-semibold tracking-tight text-foreground"
          style={{ fontSize: Math.round(size * 0.95) }}
        >
          OpenLobster
        </span>
      ) : null}
    </span>
  );
}
