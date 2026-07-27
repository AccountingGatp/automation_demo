"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getApiUrl } from "../../lib/api";

type LogItem = {
  _id: string;
  event: "export" | "quickbooks" | "sync" | "slack";
  status: "started" | "success" | "failed" | "warning";
  flow?: string;
  message: string;
  seller?: {
    id?: string;
    name?: string;
  };
  report?: {
    type?: string;
    from?: string;
    to?: string;
    rowCount?: number;
    sheetNames?: string[];
  };
  quickbooks?: {
    status?: string;
    journalId?: string;
    lineCount?: number;
  };
  error?: {
    message?: string;
  };
  createdAt: string;
};

type Counts = {
  total: number;
  success: number;
  failed: number;
};

function tone(status: LogItem["status"]) {
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function cardTone(status: LogItem["status"]) {
  if (status === "failed") return "border-red-200 bg-red-50/60";
  if (status === "success") return "border-emerald-200 bg-emerald-50/60";
  return "border-zinc-200 bg-zinc-50";
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, success: 0, failed: 0 });
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mongoReady, setMongoReady] = useState(true);
  const [apiBase, setApiBase] = useState("");

  async function fetchLogs(filter: "all" | "success" | "failed") {
    const query =
      filter === "all" ? "?limit=100" : `?status=${filter}&limit=100`;
    const res = await fetch(`${getApiUrl()}/api/logs${query}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load logs");
    return data;
  }

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLogs(statusFilter);
      setLogs(data.data || []);
      setCounts(data.counts || { total: 0, success: 0, failed: 0 });
      setMongoReady(Boolean(data.mongoReady));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setApiBase(getApiUrl());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchLogs(statusFilter);
        if (cancelled) return;
        setLogs(data.data || []);
        setCounts(data.counts || { total: 0, success: 0, failed: 0 });
        setMongoReady(Boolean(data.mongoReady));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load logs");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const latest = logs[0];
  const latestSuccess = logs.find((log) => log.status === "success");

  return (
    <main className="min-h-full bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-zinc-500">
              Monitoring
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Sync logs
            </h1>
            <p className="mt-2 max-w-3xl text-zinc-600">
              Success and failure events from every export and automate run.
            </p>
            {apiBase && (
              <p className="mt-2 text-xs text-zinc-500">
                API: <span className="font-mono">{apiBase}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadLogs}
              className="rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Refresh
            </button>
            <Link
              href="/"
              className="rounded-full border border-blue-300 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        {!mongoReady && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            MongoDB is not connected on this API. Add{" "}
            <code className="font-mono">MONGODB_URI</code> to Vercel env for production, or use
            local backend on port 5000.
          </div>
        )}

        {mongoReady && !loading && counts.total === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            No logs yet. Run <strong>Fetch report</strong> or <strong>Automate all</strong> —
            both success and failure are saved here.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Latest update
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-900">
              {latest ? latest.message : "No logs yet"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {latest ? formatWhen(latest.createdAt) : "Waiting for sync activity"}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700/80">
              Success
            </p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{counts.success}</p>
            <p className="mt-1 text-xs text-emerald-800/70">
              {latestSuccess
                ? `Last: ${latestSuccess.message}`
                : "Successful exports and syncs"}
            </p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700/80">
              Failed
            </p>
            <p className="mt-2 text-2xl font-semibold text-red-600">{counts.failed}</p>
            <p className="mt-1 text-xs text-red-700/70">
              Failed sync, export, or QuickBooks events
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Total entries
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{counts.total}</p>
            <p className="mt-1 text-xs text-zinc-500">All success + failure logs</p>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Recent activity</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Showing success and failed runs. Use the filters to narrow the list.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "success", "failed"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    statusFilter === value
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {value === "all"
                    ? `All (${counts.total})`
                    : value === "success"
                      ? `Success (${counts.success})`
                      : `Failed (${counts.failed})`}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
                Loading logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
                No {statusFilter === "all" ? "" : `${statusFilter} `}logs found.
              </div>
            ) : (
              logs.map((log) => {
                const sellerLabel = log.seller?.name || log.seller?.id;
                const reportLines = [
                  log.report?.type ? { label: "Type", value: log.report.type } : null,
                  log.report?.from || log.report?.to
                    ? {
                        label: "Range",
                        value: `${log.report?.from || "?"} to ${log.report?.to || "?"}`,
                      }
                    : null,
                  log.report?.rowCount != null
                    ? { label: "Rows", value: String(log.report.rowCount) }
                    : null,
                ].filter(Boolean) as { label: string; value: string }[];

                const qbLines = [
                  log.quickbooks?.status
                    ? { label: "QuickBooks", value: log.quickbooks.status }
                    : null,
                  log.quickbooks?.journalId
                    ? { label: "Journal ID", value: log.quickbooks.journalId }
                    : null,
                  log.quickbooks?.lineCount != null
                    ? { label: "Lines", value: String(log.quickbooks.lineCount) }
                    : null,
                ].filter(Boolean) as { label: string; value: string }[];

                return (
                  <article
                    key={log._id}
                    className={`rounded-xl border p-4 ${cardTone(log.status)}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${tone(
                              log.status
                            )}`}
                          >
                            {log.status}
                          </span>
                          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                            {log.event}
                          </span>
                          {log.flow && (
                            <span className="text-xs text-zinc-400">{log.flow}</span>
                          )}
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-zinc-900">
                          {log.message}
                        </h3>
                        {sellerLabel && (
                          <p className="mt-1 text-sm text-zinc-600">{sellerLabel}</p>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">{formatWhen(log.createdAt)}</p>
                    </div>

                    {(reportLines.length > 0 || qbLines.length > 0) && (
                      <div
                        className={`mt-4 grid gap-3 ${
                          reportLines.length > 0 && qbLines.length > 0
                            ? "md:grid-cols-2"
                            : ""
                        }`}
                      >
                        {reportLines.length > 0 && (
                          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                            {reportLines.map((line) => (
                              <p key={line.label}>
                                <span className="font-medium">{line.label}:</span>{" "}
                                {line.value}
                              </p>
                            ))}
                          </div>
                        )}
                        {qbLines.length > 0 && (
                          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                            {qbLines.map((line) => (
                              <p key={line.label}>
                                <span className="font-medium">{line.label}:</span>{" "}
                                {line.value}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {log.error?.message && (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {log.error.message}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
