import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Falsify - market research that argues back",
  description:
    "Turns a vague market question into a defined experiment, tests it against nineteen years of NIFTY data, and reports what the evidence will and will not support.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-[var(--rule)] bg-[var(--surface-page)]/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
            <Link href="/" className="flex items-baseline gap-2 no-underline">
              <span className="text-base font-semibold tracking-tight text-[var(--ink-primary)]">
                Falsify
              </span>
              <span className="hidden text-xs text-[var(--ink-muted)] sm:inline">
                question &rarr; experiment &rarr; evidence
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link
                href="/journal"
                className="text-[var(--ink-secondary)] no-underline hover:text-[var(--ink-primary)]"
              >
                Journal
              </Link>
              <Link
                href="/method"
                className="text-[var(--ink-secondary)] no-underline hover:text-[var(--ink-primary)]"
              >
                Method
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-16 border-t border-[var(--rule)]">
          <div className="mx-auto max-w-5xl px-5 py-6 text-xs leading-relaxed text-[var(--ink-muted)]">
            A research prototype, not investment advice. Every figure comes from
            a historical backtest on a price index and describes the past only.
          </div>
        </footer>
      </body>
    </html>
  );
}
