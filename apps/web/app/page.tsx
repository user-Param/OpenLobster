import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LandingNavbar } from "@/components/landing/navbar";
import { HeroTerminal } from "@/components/landing/hero-terminal";
import { ArrowRightIcon, GitBranchIcon, MessageSquareIcon, TerminalIcon } from "@/components/icons";

const CAPABILITIES: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: "Agent",
    description: "An autonomous engineer that plans, acts, and verifies its own work.",
  },
  {
    title: "Projects",
    description: "Organize repositories and workspaces in one place.",
  },
  {
    title: "Sessions",
    description: "Private conversations with full history you can revisit.",
  },
  {
    title: "Coding",
    description: "Describe a task in natural language and get working changes.",
  },
  {
    title: "Planning",
    description: "Explore approaches before a single line is written.",
  },
  {
    title: "Review",
    description: "Inspect diffs with full context for every change.",
  },
  {
    title: "Testing",
    description: "Runs your tests and reports exactly what passed.",
  },
  {
    title: "Tools",
    description: "Files, terminal, git — executed safely on your behalf.",
  },
  {
    title: "Multi-model",
    description: "Choose the model that fits the task at hand.",
  },
];

const WORKFLOW: ReadonlyArray<{ step: string; title: string; description: string }> = [
  {
    step: "01",
    title: "Prompt",
    description: "Describe what you want built, fixed, or changed.",
  },
  {
    step: "02",
    title: "Understand",
    description: "OpenLobster reads your project and gathers relevant context.",
  },
  {
    step: "03",
    title: "Execute",
    description: "It edits files, runs commands, and uses tools step by step.",
  },
  {
    step: "04",
    title: "Verify",
    description: "Tests run, results are checked, and every diff is shown.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <LandingNavbar />

      <main id="top" className="flex-1">
        {/* --- Hero ------------------------------------------------------- */}
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-20 pt-16 text-center sm:pt-24">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Build with your <span className="text-accent">AI engineer</span>.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            OpenLobster understands your project, writes code, runs tools, and helps you ship
            software.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover"
            >
              Start Building
              <ArrowRightIcon size={15} />
            </Link>
            <Link
              href="/signin"
              className="inline-flex h-11 items-center rounded-lg border border-border-strong px-5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Sign In
            </Link>
          </div>
          <div className="mt-14 flex w-full justify-center animate-fade-up">
            <HeroTerminal />
          </div>
        </section>

        {/* --- What is OpenLobster ---------------------------------------- */}
        <section id="product" className="border-t border-border bg-surface/50">
          <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center sm:py-20">
            <p className="text-xs font-medium uppercase tracking-widest text-accent">
              What is OpenLobster
            </p>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              An AI-native development workspace. Not a chatbot bolted onto an editor — an agent
              that connects your project, codebase, tools, and workflow, then shows you exactly
              what it did.
            </p>
          </div>
        </section>

        {/* --- Capabilities ------------------------------------------------ */}
        <section id="capabilities" className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Capabilities
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability) => (
              <div
                key={capability.title}
                className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <p className="text-sm font-semibold">{capability.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {capability.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* --- How it works -------------------------------------------------- */}
        <section id="how-it-works" className="border-t border-border bg-surface/50">
          <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              How OpenLobster works
            </h2>
            <ol className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {WORKFLOW.map((item) => (
                <li key={item.step} className="relative">
                  <span className="font-mono text-xs text-accent">{item.step}</span>
                  <p className="mt-2 text-sm font-semibold">{item.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* --- The workspace ---------------------------------------------- */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            One workspace, everything visible
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
            Conversation, agent activity, and diffs live side by side so you always know what the
            agent is doing.
          </p>
          <WorkspaceMock />
        </section>

        {/* --- Built for developers + CTA ------------------------------------ */}
        <section className="border-t border-border bg-surface/50">
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-16 text-center sm:py-24">
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <li>Sessions</li>
              <li aria-hidden className="text-accent">
                •
              </li>
              <li>Agent</li>
              <li aria-hidden className="text-accent">
                •
              </li>
              <li>Tools</li>
              <li aria-hidden className="text-accent">
                •
              </li>
              <li>Projects</li>
            </ul>
            <h2 className="mt-8 max-w-xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Start building with OpenLobster
            </h2>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              From “I want to build this” to “done, verified, here is what changed” — with minimal
              friction.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-6 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover"
            >
              Get Started
              <ArrowRightIcon size={15} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Logo size={18} />
          <p className="text-xs text-muted-foreground">
            An AI coding agent for developers who ship.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Stylized three-pane representation of the product UI (pure CSS). */
function WorkspaceMock() {
  return (
    <div
      className="mx-auto mt-12 grid max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl md:grid-cols-[180px_1fr_220px]"
      role="img"
      aria-label="Stylized preview of the OpenLobster workspace: sessions sidebar, chat, and activity panel"
    >
      <div className="hidden flex-col gap-2 border-b border-border p-4 md:flex md:border-b-0 md:border-r">
        <div className="mb-2 h-2 w-20 rounded bg-border-strong" />
        <div className="h-2 w-full rounded bg-muted" />
        <div className="h-2 w-4/5 rounded bg-muted" />
        <div className="h-2 w-full rounded bg-accent/60" />
        <div className="h-2 w-3/5 rounded bg-muted" />
      </div>
      <div className="flex min-h-44 flex-col justify-end gap-2 p-4">
        <div className="ml-auto w-fit rounded-lg bg-accent px-3 py-1.5 text-[11px] text-accent-foreground">
          Add rate limiting to the API
        </div>
        <div className="w-fit max-w-56 space-y-1.5 rounded-lg border border-border p-3">
          <div className="h-1.5 w-40 rounded bg-muted" />
          <div className="h-1.5 w-32 rounded bg-muted" />
          <div className="h-1.5 w-36 rounded bg-muted" />
        </div>
        <div className="w-fit rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 font-mono text-[11px] text-success">
          38 tests passed
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-border p-4 md:border-l md:border-t-0">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <TerminalIcon size={11} /> Activity
        </div>
        <MockRow icon={<GitBranchIcon size={11} />} label="edit session.ts" done />
        <MockRow icon={<MessageSquareIcon size={11} />} label="run npm test" done />
        <MockRow icon={<LoaderIconSmall />} label="verify diff" running />
      </div>
    </div>
  );
}

function MockRow({ icon, label, done, running }: { icon: React.ReactNode; label: string; done?: boolean; running?: boolean }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
      <span className={done ? "text-success" : running ? "text-accent" : ""}>{icon}</span>
      {label}
    </div>
  );
}

function LoaderIconSmall() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}
