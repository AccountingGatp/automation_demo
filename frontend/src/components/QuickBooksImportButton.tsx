"use client";

type ImportResult = {
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
};

type Props = {
  disabled?: boolean;
  loading: boolean;
  onImport: () => void;
  result: ImportResult | null;
  error: string | null;
};

function downloadCsv(csv: string, docNumber: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${docNumber || "xola-quickbooks"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function QuickBooksImportButton({
  disabled,
  loading,
  onImport,
  result,
  error,
}: Props) {
  return (
    <div className="rounded-xl border border-emerald-200/80 bg-linear-to-br from-emerald-50 via-white to-lime-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700/80">
            QuickBooks · Demo
          </p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-900">
            Simulate import
          </h3>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            No QuickBooks account is connected. This runs a dummy import
            animation and prepares a local journal CSV from the Summary sheet.
          </p>
        </div>

        <button
          type="button"
          onClick={onImport}
          disabled={disabled || loading}
          className="group relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full px-7 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(44,160,28,0.85)] transition duration-200 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_18px_36px_-12px_rgba(44,160,28,0.95)] enabled:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
          style={{
            background:
              "linear-gradient(135deg, #3ecf2a 0%, #2CA01C 42%, #1f7a14 78%, #145c0e 100%)",
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
              d="M7 7h7a3 3 0 0 1 0 6H9v4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M7 3v18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="relative">
            {loading ? "Running demo import…" : "Import to QuickBooks (Demo)"}
          </span>
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-white/90 px-4 py-3 text-sm text-zinc-700">
          <p className="font-medium text-emerald-800">{result.message}</p>
          <p className="mt-1 text-zinc-600">
            Doc <span className="font-mono">{result.docNumber}</span> ·{" "}
            {result.txnDate} · {result.totals.lineCount} lines · Gross{" "}
            {result.totals.gross.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            · Fees{" "}
            {result.totals.fees.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            · Net{" "}
            {result.totals.net.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </p>
          {result.qbo?.id && (
            <p className="mt-1 text-xs text-emerald-700">
              Demo Journal Entry ID: {result.qbo.id}
            </p>
          )}
          <button
            type="button"
            onClick={() => downloadCsv(result.csv, result.docNumber)}
            className="mt-3 inline-flex rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
          >
            Download demo CSV
          </button>
        </div>
      )}
    </div>
  );
}
