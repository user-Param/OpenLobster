import type { ReactNode } from "react";
import { AlertIcon, RefreshIcon } from "@/components/icons";
import { Button } from "./button";

/** Consistent empty state: icon, title, optional description and action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "gap-2 px-6 py-8" : "gap-3 px-6 py-14"}`}
    >
      {icon !== undefined ? (
        <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description !== undefined ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action !== undefined ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Error state with an optional retry affordance; never exposes internals. */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  compact,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "gap-2 px-6 py-8" : "gap-3 px-6 py-14"}`}
      role="alert"
    >
      <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertIcon size={18} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {message !== undefined ? (
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      ) : null}
      {onRetry !== undefined ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshIcon size={13} />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
}

/** Vertical list placeholder used while collections load. */
export function SkeletonList({ rows = 3, itemHeight = "h-14" }: { rows?: number; itemHeight?: string }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={`${itemHeight} w-full`} />
      ))}
    </div>
  );
}
