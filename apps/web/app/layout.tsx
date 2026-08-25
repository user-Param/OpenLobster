import type { Metadata, Viewport } from "next";
import { Saira } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers";

const saira = Saira({
  variable: "--font-saira",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OpenLobster — Your AI software engineer",
    template: "%s — OpenLobster",
  },
  description:
    "OpenLobster is an AI coding agent that understands your project, writes code, runs tools, and helps you ship software.",
  applicationName: "OpenLobster",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141310" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5f5" },
  ],
};

/**
 * Applied before first paint so the correct theme class is present
 * immediately (no flash). Reads only a non-sensitive UI preference.
 */
const themeInitScript = `(function(){try{var stored=localStorage.getItem("openlobster.theme");var preferred=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";var theme=stored==="light"||stored==="dark"?stored:preferred;var el=document.documentElement;el.classList.remove("light","dark");el.classList.add(theme);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${saira.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
