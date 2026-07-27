"use client";

import { useEffect, useState } from "react";

export type ProcessStep = {
  id: string;
  label: string;
  detail?: string;
  icon: "link" | "file" | "wait" | "download" | "chart" | "book" | "map" | "send" | "check";
};

type Props = {
  open: boolean;
  title: string;
  steps: ProcessStep[];
  /** Milliseconds between auto-advancing steps while waiting */
  stepIntervalMs?: number;
  /** When true, mark all steps complete */
  complete?: boolean;
  /** Optional controlled step index (disables auto-advance) */
  activeStepIndex?: number;
};

const ICONS: Record<ProcessStep["icon"], React.ReactNode> = {
  link: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.07 0L5.5 12.43a5 5 0 1 0 7.07 7.07L14 19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  file: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  wait: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  download: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  chart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19V5M4 19h16M8 16V10m4 6V7m4 9v-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  book: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M5 4v16" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  map: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  send: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12 20 4l-6 16-2.5-6.5L4 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  check: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5 10 17l9-10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

export const EXPORT_STEPS: ProcessStep[] = [
  {
    id: "connect",
    label: "Connecting to Xola",
    detail: "Authenticating with your API key",
    icon: "link",
  },
  {
    id: "create",
    label: "Creating export job",
    detail: "Requesting the workbook for this seller",
    icon: "file",
  },
  {
    id: "wait",
    label: "Waiting for workbook",
    detail: "Xola is generating the file on S3",
    icon: "wait",
  },
  {
    id: "download",
    label: "Downloading & parsing",
    detail: "Reading sheets into memory",
    icon: "download",
  },
  {
    id: "ready",
    label: "Preparing your view",
    detail: "Building table and charts",
    icon: "chart",
  },
];

export const QUICKBOOKS_STEPS: ProcessStep[] = [
  {
    id: "read",
    label: "Reading Summary sheet",
    detail: "Pulling Method / Gross / Fees / Net",
    icon: "file",
  },
  {
    id: "map",
    label: "Mapping QuickBooks accounts",
    detail: "Clearing, fees, and sales revenue",
    icon: "map",
  },
  {
    id: "build",
    label: "Building journal entry",
    detail: "Balancing debit and credit lines",
    icon: "book",
  },
  {
    id: "send",
    label: "Simulating QuickBooks import",
    detail: "Demo mode — no live QuickBooks connection",
    icon: "send",
  },
  {
    id: "done",
    label: "Import complete",
    detail: "Dummy journal entry ready for review",
    icon: "check",
  },
];

export const AUTOMATE_STEPS: ProcessStep[] = [
  ...EXPORT_STEPS,
  ...QUICKBOOKS_STEPS,
];

export function ProcessOverlay({
  open,
  title,
  steps,
  stepIntervalMs = 2800,
  complete = false,
  activeStepIndex,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const controlled = typeof activeStepIndex === "number";

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
      return;
    }
    if (!controlled) setActiveIndex(0);
  }, [open, steps, controlled]);

  useEffect(() => {
    if (controlled) {
      setActiveIndex(
        Math.max(0, Math.min(activeStepIndex!, steps.length - 1))
      );
    }
  }, [controlled, activeStepIndex, steps.length]);

  useEffect(() => {
    if (!open || complete || controlled) return;
    if (activeIndex >= steps.length - 1) return;

    const id = window.setTimeout(() => {
      setActiveIndex((i) => Math.min(i + 1, steps.length - 1));
    }, stepIntervalMs);

    return () => window.clearTimeout(id);
  }, [open, complete, controlled, activeIndex, steps.length, stepIntervalMs]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const displayIndex = complete ? steps.length - 1 : activeIndex;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center px-4"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-zinc-200/70 backdrop-blur-md" />

      <div className="relative flex max-h-[min(90vh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl shadow-zinc-400/30">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-30 blur-3xl"
          style={{
            background: "radial-gradient(circle, #86efac 0%, transparent 70%)",
          }}
        />

        <div className="shrink-0 px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 flex h-10 w-10 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                {complete ? ICONS.check : ICONS[steps[displayIndex]?.icon || "wait"]}
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                In progress
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">
                {title}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Please wait — the screen is locked until this finishes.
              </p>
            </div>
          </div>
        </div>

        <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-6">
          {steps.map((step, index) => {
            const done = complete || index < displayIndex;
            const active = !complete && index === displayIndex;
            const upcoming = !done && !active;

            return (
              <li
                key={step.id}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition duration-300 ${
                  active
                    ? "border-emerald-300 bg-emerald-50"
                    : done
                      ? "border-zinc-200 bg-zinc-50"
                      : "border-transparent bg-transparent opacity-45"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {done ? (
                    ICONS.check
                  ) : active ? (
                    <span className="relative flex h-5 w-5 items-center justify-center">
                      <span className="absolute inset-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
                      <span className="scale-75">{ICONS[step.icon]}</span>
                    </span>
                  ) : (
                    <span className="scale-75">{ICONS[step.icon]}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      active
                        ? "text-zinc-900"
                        : done
                          ? "text-zinc-700"
                          : "text-zinc-400"
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.detail && (
                    <p
                      className={`text-xs ${
                        active ? "text-emerald-700/80" : "text-zinc-500"
                      }`}
                    >
                      {upcoming ? "Waiting…" : step.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="shrink-0 px-6 pt-4 pb-6">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-linear-to-r from-emerald-500 to-lime-400 transition-all duration-700 ease-out"
              style={{
                width: `${
                  ((complete ? steps.length : displayIndex + 1) / steps.length) * 100
                }%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
