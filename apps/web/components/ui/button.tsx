"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { LoaderIcon } from "@/components/icons";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-active shadow-sm",
  secondary: "bg-muted text-foreground hover:bg-elevated border border-border",
  outline: "border border-border-strong text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-muted",
  danger:
    "bg-danger text-white hover:opacity-90 active:opacity-80",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-xs",
  md: "h-9 gap-2 rounded-lg px-3.5 text-sm",
  lg: "h-11 gap-2 rounded-lg px-5 text-base",
  icon: "size-9 rounded-lg",
  "icon-sm": "size-7 rounded-md",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled === true || loading}
      className={`inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className ?? ""}`}
      {...rest}
    >
      {loading ? <LoaderIcon size={size === "sm" || size === "icon-sm" ? 12 : 14} className="animate-spin" /> : null}
      {children}
    </button>
  );
});
