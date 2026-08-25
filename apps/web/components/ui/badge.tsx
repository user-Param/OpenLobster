import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-accent-soft text-accent border-transparent",
  success: "bg-success/10 text-success border-transparent",
  warning: "bg-warning/10 text-warning border-transparent",
  danger: "bg-danger/10 text-danger border-transparent",
  info: "bg-muted text-foreground border-border",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 ${toneClasses[tone]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral" }: { tone?: BadgeTone }) {
  const color =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : tone === "brand"
            ? "bg-accent"
            : "bg-muted-foreground";
  return <span aria-hidden className={`size-1.5 rounded-full ${color}`} />;
}
