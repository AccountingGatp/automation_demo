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
};

export type DummyQbResult = {
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

function parseMoney(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function findHeader(headers: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const hit = headers.find((h) => pattern.test(h));
    if (hit) return hit;
  }
  return null;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Client-side demo import — builds a fake QuickBooks journal from Summary.
 * No live QuickBooks API call.
 */
export function buildDummyQuickBooksImport(
  sheets: SheetData[],
  meta: ReportMeta
): DummyQbResult {
  const summary =
    sheets.find((s) => /summary/i.test(s.sheetName)) || sheets[0];

  const methodCol = findHeader(summary?.headers || [], [/^method$/i, /method/i]);
  const grossCol = findHeader(summary?.headers || [], [/^gross$/i, /gross/i]);
  const netCol = findHeader(summary?.headers || [], [/^net$/i, /net/i]);
  const processingCol = findHeader(summary?.headers || [], [/processing fee/i]);
  const serviceCol = findHeader(summary?.headers || [], [/service fee/i]);
  const guestCol = findHeader(summary?.headers || [], [/guest fee/i]);

  let gross = 0;
  let net = 0;
  let fees = 0;
  const csvLines: string[] = [
    "DocNumber,TxnDate,PostingType,Account,Amount,Memo,Method",
  ];

  const docNumber = `DEMO-XOLA-${(meta.from || "").replace(/-/g, "")}-${(meta.to || "").replace(/-/g, "")}`;
  const txnDate = meta.to || new Date().toISOString().slice(0, 10);
  let lineCount = 0;

  for (const row of summary?.rows || []) {
    const method = methodCol ? String(row[methodCol] ?? "").trim() : "";
    if (!method) continue;

    const g = grossCol ? parseMoney(row[grossCol]) : 0;
    const n = netCol ? parseMoney(row[netCol]) : 0;
    const f =
      (processingCol ? parseMoney(row[processingCol]) : 0) +
      (serviceCol ? parseMoney(row[serviceCol]) : 0) +
      (guestCol ? parseMoney(row[guestCol]) : 0);

    if (g === 0 && n === 0 && f === 0) continue;

    gross += g;
    net += n;
    fees += f;

    const clearing = n || round2(g - f);
    if (clearing) {
      csvLines.push(
        `${docNumber},${txnDate},Debit,Undeposited Funds,${Math.abs(clearing).toFixed(2)},"Xola ${method} clearing","${method}"`
      );
      lineCount += 1;
    }
    if (f) {
      csvLines.push(
        `${docNumber},${txnDate},Debit,Merchant Fees,${Math.abs(f).toFixed(2)},"Xola ${method} fees","${method}"`
      );
      lineCount += 1;
    }
    if (g) {
      csvLines.push(
        `${docNumber},${txnDate},Credit,Sales Revenue,${Math.abs(g).toFixed(2)},"Xola ${method} sales","${method}"`
      );
      lineCount += 1;
    }
  }

  if (lineCount === 0) {
    lineCount = 3;
    csvLines.push(
      `${docNumber},${txnDate},Debit,Undeposited Funds,0.00,"Demo clearing","Demo"`,
      `${docNumber},${txnDate},Debit,Merchant Fees,0.00,"Demo fees","Demo"`,
      `${docNumber},${txnDate},Credit,Sales Revenue,0.00,"Demo sales","Demo"`
    );
  }

  return {
    status: "prepared",
    message:
      "Demo import complete — QuickBooks is not connected. Journal entry was simulated locally.",
    docNumber,
    txnDate,
    totals: {
      gross: round2(gross),
      net: round2(net),
      fees: round2(fees),
      lineCount,
    },
    csv: csvLines.join("\n"),
    qbo: { id: `DEMO-${Date.now().toString(36).toUpperCase()}` },
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
