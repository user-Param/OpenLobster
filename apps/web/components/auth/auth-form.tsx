"use client";

/**
 * Shared sign-in / sign-up experience per DESIGN.md: two-column layout,
 * centered auth card, third-party slot, divider, email flow, secondary
 * action. The backend currently exposes only email/password auth, so the
 * third-party option is rendered as explicitly unavailable rather than
 * faking an OAuth flow.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LobsterMark, Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { RedirectIfAuthenticated } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/auth-context";

type Mode = "signin" | "signup";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeNextPath(raw: string | null): string {
  if (raw !== null && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/workspace";
}

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

function validate(mode: Mode, name: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "signup" && name.trim().length === 0) errors.name = "Name is required.";
  else if (mode === "signup" && name.trim().length > 120) errors.name = "Name is too long.";
  if (email.trim().length === 0) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter a valid email address.";
  if (password.length === 0) errors.password = "Password is required.";
  else if (mode === "signup" && password.length < 8) errors.password = "Use at least 8 characters.";
  else if (password.length > 128) errors.password = "Password is too long.";
  return errors;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const { signIn, signUp } = useAuth();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    const errors = validate(mode, name, email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUp({ name: name.trim(), email: email.trim(), password });
      } else {
        await signIn({ email: email.trim(), password });
      }
      // Full navigation so server components refetch with the new session.
      window.location.assign(nextPath);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setFieldErrors({ email: "That email is already registered." });
        } else if (error.status === 400 || error.status === 422) {
          setFormError("Please check your details and try again.");
        } else if (error.status === 0) {
          setFormError(error.message);
        } else if (error.status >= 500) {
          setFormError(error.message);
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  const isSignUp = mode === "signup";

  return (
    <RedirectIfAuthenticated fallbackTo={nextPath}>
      <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(420px,44%)_1fr]">
        {/* --- Left: authentication -------------------------------------- */}
        <div className="flex flex-col px-6 py-6 sm:px-10">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label="OpenLobster home" className="rounded-md">
              <Logo size={20} />
            </Link>
            <ThemeToggle />
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isSignUp
                ? "Start building with an AI engineer that works alongside you."
                : "Sign in to continue building with OpenLobster."}
            </p>

            <div className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-sm">
              {/* Third-party slot: intentionally inert until the backend supports it. */}
              <Button variant="secondary" size="lg" className="w-full" disabled aria-disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
                  <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
                </svg>
                Continue with GitHub
                <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Soon
                </span>
              </Button>

              <div className="my-5 flex items-center gap-3" role="separator" aria-label="or continue with email">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-widest text-faint">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
                <div className="flex flex-col gap-4">
                  {isSignUp ? (
                    <Field label="Name" htmlFor="auth-name" error={fieldErrors.name ?? null}>
                      <TextInput
                        id="auth-name"
                        name="name"
                        autoComplete="name"
                        placeholder="Ada Lovelace"
                        value={name}
                        maxLength={120}
                        onChange={(event) => setName(event.target.value)}
                        invalid={fieldErrors.name !== undefined}
                        disabled={submitting}
                        required
                      />
                    </Field>
                  ) : null}
                  <Field label="Email" htmlFor="auth-email" error={fieldErrors.email ?? null}>
                    <TextInput
                      id="auth-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      invalid={fieldErrors.email !== undefined}
                      disabled={submitting}
                      required
                    />
                  </Field>
                  <Field
                    label="Password"
                    htmlFor="auth-password"
                    error={fieldErrors.password ?? null}
                    hint={isSignUp ? "At least 8 characters." : undefined}
                  >
                    <TextInput
                      id="auth-password"
                      name="password"
                      type="password"
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      placeholder="••••••••"
                      value={password}
                      maxLength={128}
                      onChange={(event) => setPassword(event.target.value)}
                      invalid={fieldErrors.password !== undefined}
                      disabled={submitting}
                      required
                    />
                  </Field>

                  {formError !== null ? (
                    <p role="alert" className="text-sm text-danger">
                      {formError}
                    </p>
                  ) : null}

                  <Button type="submit" size="lg" className="w-full" loading={submitting}>
                    {submitting
                      ? isSignUp
                        ? "Creating account"
                        : "Signing in"
                      : isSignUp
                        ? "Continue with Email"
                        : "Sign In"}
                  </Button>
                </div>
              </form>
            </div>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account? " : "New to OpenLobster? "}
              <Link
                href={isSignUp ? "/signin" : "/signup"}
                className="font-medium text-accent hover:underline"
              >
                {isSignUp ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </div>

          <p className="text-center text-xs text-faint lg:text-left">
            Protected by session tokens issued by the OpenLobster API.
          </p>
        </div>

        {/* --- Right: brand visual ---------------------------------------- */}
        <aside
          aria-hidden
          className="relative hidden overflow-hidden border-l border-border lg:block"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 85% 15%, var(--ol-accent-soft) 0%, transparent 55%), radial-gradient(100% 80% at 15% 95%, var(--ol-accent-soft) 0%, transparent 50%)",
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-16">
            <LobsterMark size={140} className="opacity-90 drop-shadow-xl" />
            <blockquote className="max-w-md text-center">
              <p className="text-pretty text-xl font-medium leading-relaxed text-foreground">
                “Describe the task. Watch it get built. Review exactly what changed.”
              </p>
            </blockquote>
          </div>
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, var(--ol-accent), transparent)" }}
          />
        </aside>
      </div>
    </RedirectIfAuthenticated>
  );
}
