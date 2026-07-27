"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../../lib/api";

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

function tone(status: LogItem["status"]) {
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mongoReady, setMongoReady] = useState(true);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const query =
        statusFilter === "all" ? "?limit=100" : `?status=${statusFilter}&limit=100`;
      const res = await fetch(`${API_URL}/api/logs${query}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load logs");
      setLogs(data.data || []);
      setMongoReady(Boolean(data.mongoReady));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const query =
          statusFilter === "all" ? "?limit=100" : `?status=${statusFilter}&limit=100`;
        const res = await fetch(`${API_URL}/api/logs${query}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load logs");
        if (cancelled) return;
        setLogs(data.data || []);
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

  const failedCount = useMemo(
    () => logs.filter((log) => log.status === "failed").length,
    [logs]
  );

  const latest = logs[0];

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
              Review the latest sync activity, see what failed, and track the most
              recent updates stored in MongoDB.
            </p>
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
            MongoDB is not connected. Set `MONGODB_URI` in the backend to start storing logs.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
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
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Failures shown
            </p>
            <p className="mt-2 text-2xl font-semibold text-red-600">{failedCount}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Failed sync, export, or QuickBooks events in this view
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Entries loaded
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{logs.length}</p>
            <p className="mt-1 text-xs text-zinc-500">Latest 100 records max</p>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Recent activity</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Filter by status to focus on healthy runs or failures.
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
                  {value === "all" ? "All" : value === "success" ? "Success" : "Failed"}
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
                No logs found for this filter.
              </div>
            ) : (
              logs.map((log) => (
                <article
                  key={log._id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
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
                      <p className="mt-1 text-sm text-zinc-600">
                        {log.seller?.name || log.seller?.id || "Unknown seller"}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-500">{formatWhen(log.createdAt)}</p>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                      <p>
                        <span className="font-medium">Type:</span>{" "}
                        {log.report?.type || "—"}
                      </p>
                      <p>
                        <span className="font-medium">Range:</span>{" "}
                        {log.report?.from || "—"} to {log.report?.to || "—"}
                      </p>
                      <p>
                        <span className="font-medium">Rows:</span>{" "}
                        {log.report?.rowCount ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                      <p>
                        <span className="font-medium">QuickBooks:</span>{" "}
                        {log.quickbooks?.status || "—"}
                      </p>
                      <p>
                        <span className="font-medium">Journal ID:</span>{" "}
                        {log.quickbooks?.journalId || "—"}
                      </p>
                      <p>
                        <span className="font-medium">Lines:</span>{" "}
                        {log.quickbooks?.lineCount ?? "—"}
                      </p>
                    </div>
                  </div>

                  {log.error?.message && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {log.error.message}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
