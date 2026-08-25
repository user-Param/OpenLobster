"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, LoaderIcon } from "@/components/icons";

interface DemoStep {
  kind: "prompt" | "active" | "done" | "summary";
  text: string;
}

const SCRIPT: readonly DemoStep[] = [
  { kind: "prompt", text: "Fix the authentication flow" },
  { kind: "active", text: "Reading src/auth/session.ts" },
  { kind: "done", text: "Found expired-token handling" },
  { kind: "done", text: "Updated session middleware" },
  { kind: "active", text: "Running test suite" },
  { kind: "summary", text: "38 tests passed" },
];

/**
 * The hero product demo: an abstract agent run that types itself out.
 * Loops gently; renders instantly when reduced motion is preferred.
 */
export function HeroTerminal() {
  const [visibleCount, setVisibleCount] = useState(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion.current) {
      setVisibleCount(SCRIPT.length);
      return;
    }
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      if (step > SCRIPT.length + 4) {
        // Hold the finished state briefly, then restart the demo.
        step = 0;
      }
      setVisibleCount(Math.min(step, SCRIPT.length));
    }, 900);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface text-left shadow-2xl"
      role="img"
      aria-label="Animated preview of an OpenLobster agent run fixing authentication and passing tests"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-border-strong" />
        <span className="size-2.5 rounded-full bg-border-strong" />
        <span className="size-2.5 rounded-full bg-accent" />
        <span className="ml-3 font-mono text-xs text-muted-foreground">openlobster</span>
      </div>
      <div className="flex min-h-56 flex-col gap-2 px-4 py-4 font-mono text-[13px] leading-6">
        {SCRIPT.slice(0, visibleCount).map((step, index) => (
          <div key={index} className={`flex items-start gap-2.5 ${index === visibleCount - 1 ? "animate-fade-up" : ""}`}>
            {step.kind === "prompt" ? (
              <>
                <span className="text-accent">&gt;</span>
                <span className="text-foreground">{step.text}</span>
              </>
            ) : step.kind === "active" ? (
              <>
                <LoaderIcon size={14} className="mt-1 shrink-0 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">{step.text}</span>
              </>
            ) : step.kind === "done" ? (
              <>
                <CheckIcon size={14} className="mt-1 shrink-0 text-success" />
                <span className="text-muted-foreground">{step.text}</span>
              </>
            ) : (
              <span className="mt-1 text-success">{step.text}</span>
            )}
          </div>
        ))}
        {visibleCount < SCRIPT.length || SCRIPT[visibleCount - 1]?.kind !== "summary" ? (
          <span className="text-accent animate-caret" aria-hidden>
            ▍
          </span>
        ) : null}
      </div>
    </div>
  );
}
