"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReportCharts } from "../components/ReportCharts";
import { QuickBooksImportButton } from "../components/QuickBooksImportButton";
import {
  AUTOMATE_STEPS,
  EXPORT_STEPS,
  ProcessOverlay,
  QUICKBOOKS_STEPS,
  type ProcessStep,
} from "../components/ProcessOverlay";
import {
  buildDummyQuickBooksImport,
  sleep,
} from "../lib/dummyQuickBooks";

const API_URL = "https://automation-demo-olive.vercel.app";

async function notifySlackSync(payload: Record<string, unknown>) {
  try {
    await fetch(`${API_URL}/api/slack/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Slack is best-effort — never block the UI
  }
}

const SELLERS_STEPS: ProcessStep[] = [
  {
    id: "connect",
    label: "Connecting to Xola",
    detail: "Opening a secure API session",
    icon: "link",
  },
  {
    id: "sellers",
    label: "Loading sellers",
    detail: "Fetching your delegator list",
    icon: "file",
  },
];

type Seller = {
  id: string;
  name: string;
  email: string | null;
};

type SheetData = {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

type ReportMeta = {
  type: string;
  from: string;
  to: string;
  seller: string;
  sheetName: string;
  rowCount: number;
};

type ReportData = {
  meta: ReportMeta;
  headers: string[];
  rows: Record<string, unknown>[];
  sheets: SheetData[];
};

type SortState = {
  key: string;
  dir: "asc" | "desc";
} | null;

const MONEY_HINT =
  /gross|net|fee|amount|total|price|payout|commission|balance|deposit/i;

function defaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export default function Home() {
  const defaults = defaultDates();
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sellersLoading, setSellersLoading] = useState(true);
  const [sellersError, setSellersError] = useState<string | null>(null);
  const [seller, setSeller] = useState("");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [type, setType] = useState<"account" | "payout">("account");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");

  const [qbLoading, setQbLoading] = useState(false);
  const [qbError, setQbError] = useState<string | null>(null);
  const [qbResult, setQbResult] = useState<{
    status: "posted" | "prepared";
    message: string;
    docNumber: string;
    txnDate: string;
    totals: {
      gross: number;
      net: number;
      fees: number;
      lineCount: number;
    };
    csv: string;
    qbo: { id?: string } | null;
  } | null>(null);

  const [overlayComplete, setOverlayComplete] = useState(false);
  const [automating, setAutomating] = useState(false);
  const [autoStepIndex, setAutoStepIndex] = useState(0);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const busy = loading || qbLoading || automating || sellersLoading;

  useEffect(() => {
    async function loadSellers() {
      setSellersLoading(true);
      setOverlayComplete(false);
      try {
        const res = await fetch(`${API_URL}/api/delegators`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load sellers");
        setSellers(data.data || []);
        if (data.data?.length) setSeller(data.data[0].id);
        setOverlayComplete(true);
        await new Promise((r) => setTimeout(r, 450));
      } catch (err) {
        setSellersError(
          err instanceof Error ? err.message : "Failed to load sellers"
        );
      } finally {
        setSellersLoading(false);
        setOverlayComplete(false);
      }
    }
    loadSellers();
  }, []);

  const currentSheet = useMemo(() => {
    if (!report) return null;
    return (
      report.sheets.find((s) => s.sheetName === activeSheet) ||
      report.sheets[0] || {
        sheetName: report.meta.sheetName,
        headers: report.headers,
        rows: report.rows,
        rowCount: report.rows.length,
      }
    );
  }, [report, activeSheet]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setOverlayComplete(false);
      setError(null);
      setReport(null);
      setQbResult(null);
      setQbError(null);
      setSearch("");
      setSort(null);
      setPage(0);

      try {
        const sellerName =
          sellers.find((s) => s.id === seller)?.name || seller;
        const res = await fetch(`${API_URL}/api/reports/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            from,
            to,
            seller,
            sellerName,
            flow: "export",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Export failed");
        setReport(data);
        setActiveSheet(data.meta.sheetName || data.sheets?.[0]?.sheetName || "");
        setOverlayComplete(true);
        await new Promise((r) => setTimeout(r, 550));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export failed");
      } finally {
        setLoading(false);
        setOverlayComplete(false);
      }
    },
    [type, from, to, seller, sellers]
  );

  const moneyColumns = useMemo(() => {
    if (!currentSheet) return [];
    return currentSheet.headers.filter((h) => MONEY_HINT.test(h));
  }, [currentSheet]);

  const filteredRows = useMemo(() => {
    if (!currentSheet) return [];
    const q = search.trim().toLowerCase();
    let rows = currentSheet.rows;

    if (q) {
      rows = rows.filter((row) =>
        currentSheet.headers.some((h) =>
          cellText(row[h]).toLowerCase().includes(q)
        )
      );
    }

    if (sort) {
      const { key, dir } = sort;
      rows = [...rows].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        const an = parseMoney(av);
        const bn = parseMoney(bv);
        if (an != null && bn != null) {
          return dir === "asc" ? an - bn : bn - an;
        }
        const as = cellText(av).toLowerCase();
        const bs = cellText(bv).toLowerCase();
        if (as < bs) return dir === "asc" ? -1 : 1;
        if (as > bs) return dir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }, [currentSheet, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);

  const summaries = useMemo(() => {
    if (!currentSheet || !moneyColumns.length) return [];
    return moneyColumns.map((col) => {
      let sum = 0;
      let count = 0;
      for (const row of filteredRows) {
        const n = parseMoney(row[col]);
        if (n != null) {
          sum += n;
          count += 1;
        }
      }
      return { col, sum, count };
    });
  }, [currentSheet, moneyColumns, filteredRows]);

  const onImportQuickBooks = useCallback(async () => {
    if (!report || automating) return;
    setQbLoading(true);
    setOverlayComplete(false);
    setQbError(null);
    setQbResult(null);

    try {
      // Dummy animation only — no live QuickBooks API
      const stepMs = 1100;
      await sleep(QUICKBOOKS_STEPS.length * stepMs);

      const data = buildDummyQuickBooksImport(report.sheets, report.meta);
      setQbResult(data);
      setOverlayComplete(true);
      await sleep(700);
    } catch (err) {
      setQbError(
        err instanceof Error ? err.message : "Demo QuickBooks import failed"
      );
    } finally {
      setQbLoading(false);
      setOverlayComplete(false);
    }
  }, [report, automating]);

  const onAutomateAll = useCallback(async () => {
    if (!seller || busy) return;

    setAutomating(true);
    setOverlayComplete(false);
    setAutoStepIndex(0);
    setError(null);
    setQbError(null);
    setReport(null);
    setQbResult(null);
    setSearch("");
    setSort(null);
    setPage(0);

    const sellerName = sellers.find((s) => s.id === seller)?.name || seller;

    try {
      // Phase 1 — advance through early export steps, then hold on "wait"
      for (let i = 0; i < EXPORT_STEPS.length - 2; i++) {
        setAutoStepIndex(i);
        await sleep(900);
      }
      setAutoStepIndex(EXPORT_STEPS.length - 2); // Waiting for workbook

      const res = await fetch(`${API_URL}/api/reports/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          from,
          to,
          seller,
          sellerName,
          flow: "automate",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");

      setAutoStepIndex(EXPORT_STEPS.length - 1); // Preparing your view
      setReport(data);
      setActiveSheet(data.meta.sheetName || data.sheets?.[0]?.sheetName || "");
      await sleep(800);

      // Phase 2 — demo QuickBooks import steps
      for (let i = 0; i < QUICKBOOKS_STEPS.length; i++) {
        setAutoStepIndex(EXPORT_STEPS.length + i);
        await sleep(1100);
      }

      const qb = buildDummyQuickBooksImport(data.sheets, data.meta);
      setQbResult(qb);
      await notifySlackSync({
        event: "sync_complete",
        type,
        from,
        to,
        seller,
        sellerName,
        rowCount: data.meta?.rowCount,
        qbStatus: qb.status,
        journalLines: qb.totals.lineCount,
      });
      setOverlayComplete(true);
      await sleep(800);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Automation failed";
      setError(message);
      await notifySlackSync({
        event: "sync_failed",
        type,
        from,
        to,
        seller,
        sellerName,
        error: message,
      });
    } finally {
      setAutomating(false);
      setOverlayComplete(false);
      setAutoStepIndex(0);
    }
  }, [seller, busy, type, from, to, sellers]);

  const processOverlay = useMemo(() => {
    if (automating) {
      return {
        open: true,
        title: "Full automation",
        steps: AUTOMATE_STEPS,
        stepIntervalMs: 1100,
        controlledIndex: autoStepIndex,
      };
    }
    if (loading) {
      return {
        open: true,
        title: "Fetching Xola report",
        steps: EXPORT_STEPS,
        stepIntervalMs: 3200,
        controlledIndex: undefined as number | undefined,
      };
    }
    if (qbLoading) {
      return {
        open: true,
        title: "Demo · QuickBooks import",
        steps: QUICKBOOKS_STEPS,
        stepIntervalMs: 1100,
        controlledIndex: undefined as number | undefined,
      };
    }
    if (sellersLoading) {
      return {
        open: true,
        title: "Starting up",
        steps: SELLERS_STEPS,
        stepIntervalMs: 1200,
        controlledIndex: undefined as number | undefined,
      };
    }
    return null;
  }, [automating, autoStepIndex, loading, qbLoading, sellersLoading]);

  function toggleSort(key: string) {
    setPage(0);
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function switchSheet(name: string) {
    setActiveSheet(name);
    setSearch("");
    setSort(null);
    setPage(0);
  }

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900">
      {processOverlay && (
        <ProcessOverlay
          open={processOverlay.open}
          title={processOverlay.title}
          steps={processOverlay.steps}
          stepIntervalMs={processOverlay.stepIntervalMs}
          complete={overlayComplete}
          activeStepIndex={processOverlay.controlledIndex}
        />
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-zinc-500">
              GATP Demo
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Xola report viewer
            </h1>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Fetch one export from Xola, parse it in memory, and explore the
              rows. Nothing is saved to disk.
            </p>
          </div>

          <button
            type="button"
            onClick={onAutomateAll}
            disabled={!seller || busy}
            className="group relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(37,99,235,0.75)] transition duration-200 enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, #60a5fa 0%, #2563eb 45%, #1d4ed8 100%)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
              style={{
                background:
                  "linear-gradient(120deg, transparent 20%, rgba(255,255,255,0.28) 48%, transparent 72%)",
              }}
            />
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="relative"
            >
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="relative">
              {automating ? "Running full automation…" : "Automate all"}
            </span>
          </button>
        </header>

        <form
          onSubmit={onSubmit}
          className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="flex flex-col gap-1 text-sm lg:col-span-2">
            <span className="font-medium text-zinc-700">Seller</span>
            <select
              className="rounded-md border border-zinc-300 bg-white px-3 py-2"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              disabled={!sellers.length || busy}
              required
            >
              {!sellers.length && <option value="">Loading…</option>}
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {sellersError && (
              <span className="text-xs text-red-600">{sellersError}</span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">From</span>
            <input
              type="date"
              className="rounded-md border border-zinc-300 px-3 py-2"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
              disabled={busy}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">To</span>
            <input
              type="date"
              className="rounded-md border border-zinc-300 px-3 py-2"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
              disabled={busy}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Report type</span>
            <select
              className="rounded-md border border-zinc-300 bg-white px-3 py-2"
              value={type}
              onChange={(e) =>
                setType(e.target.value as "account" | "payout")
              }
              disabled={busy}
            >
              <option value="account">Account (revenue)</option>
              <option value="payout">Payout (settlement)</option>
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-5">
            <button
              type="submit"
              disabled={busy || !seller}
              className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Fetching export… (may take a minute)"
                : "Fetch report"}
            </button>
            <button
              type="button"
              onClick={onAutomateAll}
              disabled={!seller || busy}
              className="rounded-md border border-blue-300 bg-blue-50 px-5 py-2.5 text-sm font-medium text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {automating ? "Automating…" : "Automate all (1 click)"}
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {report && currentSheet && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {report.sheets.map((s) => (
                <button
                  key={s.sheetName}
                  type="button"
                  onClick={() => switchSheet(s.sheetName)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    s.sheetName === currentSheet.sheetName
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {s.sheetName} ({s.rowCount})
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  {currentSheet.sheetName}
                </h2>
                <p className="text-sm text-zinc-600">
                  {report.meta.type} · {report.meta.from} → {report.meta.to} ·{" "}
                  {filteredRows.length} of {currentSheet.rowCount} rows
                </p>
              </div>
              <label className="flex w-full max-w-xs flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-700">Search</span>
                <input
                  type="search"
                  placeholder="Filter all columns…"
                  className="rounded-md border border-zinc-300 px-3 py-2"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
            </div>

            {summaries.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {summaries.slice(0, 4).map((s) => (
                  <div
                    key={s.col}
                    className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
                  >
                    <p className="truncate text-xs uppercase tracking-wide text-zinc-500">
                      {s.col}
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {s.sum.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p className="text-xs text-zinc-500">{s.count} values</p>
                  </div>
                ))}
              </div>
            )}

            <ReportCharts sheets={report.sheets} />

            <QuickBooksImportButton
              loading={qbLoading || automating}
              disabled={busy}
              onImport={onImportQuickBooks}
              result={qbResult}
              error={qbError}
            />

            <div className="overflow-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-zinc-100">
                  <tr>
                    {currentSheet.headers.map((h) => {
                      const active = sort?.key === h;
                      return (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2 font-medium"
                        >
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-zinc-950"
                            onClick={() => toggleSort(h)}
                          >
                            {h}
                            <span className="text-xs text-zinc-400">
                              {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={currentSheet.headers.length}
                        className="px-3 py-8 text-center text-zinc-500"
                      >
                        No rows match your search.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => (
                      <tr
                        key={String(row.__row)}
                        className="border-t border-zinc-100 hover:bg-zinc-50"
                      >
                        {currentSheet.headers.map((h) => (
                          <td
                            key={h}
                            className="max-w-xs truncate whitespace-nowrap px-3 py-2 text-zinc-700"
                            title={cellText(row[h])}
                          >
                            {cellText(row[h])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-4 text-sm">
              <p className="text-zinc-600">
                Page {page + 1} of {pageCount}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 disabled:opacity-40"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 disabled:opacity-40"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
