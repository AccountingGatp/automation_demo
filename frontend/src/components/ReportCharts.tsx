"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SheetData = {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

const COLORS = [
  "#18181b",
  "#3f3f46",
  "#52525b",
  "#71717a",
  "#a1a1aa",
  "#0f766e",
  "#b45309",
  "#9f1239",
  "#1d4ed8",
  "#6d28d9",
];

function parseMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function findHeader(headers: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const hit = headers.find((h) => pattern.test(h));
    if (hit) return hit;
  }
  return null;
}

function toDayKey(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();

  // "2026-7-7 23:41:37" or ISO-ish
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, "0");
    const d = iso[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function moneyTick(v: number) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
      <div className="h-64 w-full">{children}</div>
    </div>
  );
}

export function ReportCharts({ sheets }: { sheets: SheetData[] }) {
  const summarySheet = sheets.find((s) => /summary/i.test(s.sheetName));
  const txnSheet =
    sheets.find((s) => /transaction/i.test(s.sheetName)) ||
    sheets.find((s) => s.rowCount > 0);

  const methodBars = useMemo(() => {
    const sheet = summarySheet;
    if (!sheet) return [];
    const methodCol = findHeader(sheet.headers, [/^method$/i, /method/i]);
    const grossCol = findHeader(sheet.headers, [/^gross$/i, /gross/i]);
    const netCol = findHeader(sheet.headers, [/^net$/i, /net/i]);
    if (!methodCol || (!grossCol && !netCol)) return [];

    return sheet.rows
      .map((row) => {
        const method = cellText(row[methodCol]).trim();
        if (!method) return null;
        return {
          method: method.length > 22 ? `${method.slice(0, 20)}…` : method,
          fullMethod: method,
          Gross: grossCol ? parseMoney(row[grossCol]) ?? 0 : 0,
          Net: netCol ? parseMoney(row[netCol]) ?? 0 : 0,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
      .sort((a, b) => b.Gross - a.Gross)
      .slice(0, 10);
  }, [summarySheet]);

  const dailyTrend = useMemo(() => {
    if (!txnSheet) return [];
    const dateCol = findHeader(txnSheet.headers, [
      /transaction date/i,
      /created/i,
      /date/i,
    ]);
    const grossCol = findHeader(txnSheet.headers, [/^gross$/i, /gross/i]);
    const netCol = findHeader(txnSheet.headers, [/^net$/i, /net/i]);
    if (!dateCol || (!grossCol && !netCol)) return [];

    const map = new Map<string, { date: string; Gross: number; Net: number; count: number }>();
    for (const row of txnSheet.rows) {
      const day = toDayKey(row[dateCol]);
      if (!day) continue;
      const entry = map.get(day) || { date: day, Gross: 0, Net: 0, count: 0 };
      entry.Gross += grossCol ? parseMoney(row[grossCol]) ?? 0 : 0;
      entry.Net += netCol ? parseMoney(row[netCol]) ?? 0 : 0;
      entry.count += 1;
      map.set(day, entry);
    }

    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [txnSheet]);

  const methodPie = useMemo(() => {
    if (!txnSheet) return [];
    const methodCol = findHeader(txnSheet.headers, [/^method$/i, /method/i]);
    const grossCol = findHeader(txnSheet.headers, [/^gross$/i, /gross/i]);
    if (!methodCol || !grossCol) return [];

    const map = new Map<string, number>();
    for (const row of txnSheet.rows) {
      const method = cellText(row[methodCol]).trim() || "Unknown";
      map.set(method, (map.get(method) || 0) + (parseMoney(row[grossCol]) ?? 0));
    }

    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .filter((d) => d.value !== 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [txnSheet]);

  const topPackages = useMemo(() => {
    if (!txnSheet) return [];
    const pkgCol = findHeader(txnSheet.headers, [
      /^item$/i,
      /package/i,
      /product/i,
    ]);
    const grossCol = findHeader(txnSheet.headers, [/^gross$/i, /gross/i]);
    if (!pkgCol || !grossCol) return [];

    const map = new Map<string, number>();
    for (const row of txnSheet.rows) {
      const name = cellText(row[pkgCol]).trim() || "Untitled";
      map.set(name, (map.get(name) || 0) + (parseMoney(row[grossCol]) ?? 0));
    }

    return [...map.entries()]
      .map(([name, Gross]) => ({
        name: name.length > 28 ? `${name.slice(0, 26)}…` : name,
        fullName: name,
        Gross: Math.round(Gross * 100) / 100,
      }))
      .filter((d) => d.Gross !== 0)
      .sort((a, b) => b.Gross - a.Gross)
      .slice(0, 8);
  }, [txnSheet]);

  if (!methodBars.length && !dailyTrend.length && !methodPie.length && !topPackages.length) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {dailyTrend.length > 0 && (
        <ChartCard
          title="Daily Gross & Net"
          subtitle="From Transactions sheet"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={moneyTick} tick={{ fontSize: 11 }} width={48} />
              <Tooltip
                formatter={(value) =>
                  Number(value).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                }
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Gross"
                stroke="#18181b"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Net"
                stroke="#0f766e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {methodBars.length > 0 && (
        <ChartCard
          title="Gross & Net by Method"
          subtitle="From Summary sheet"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={methodBars} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis
                dataKey="method"
                interval={0}
                angle={-25}
                textAnchor="end"
                tick={{ fontSize: 10 }}
                height={60}
              />
              <YAxis tickFormatter={moneyTick} tick={{ fontSize: 11 }} width={48} />
              <Tooltip
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullMethod || ""
                }
                formatter={(value) =>
                  Number(value).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                }
              />
              <Legend />
              <Bar dataKey="Gross" fill="#18181b" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Net" fill="#0f766e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {methodPie.length > 0 && (
        <ChartCard
          title="Gross share by Method"
          subtitle="From Transactions sheet"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={methodPie}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={84}
                paddingAngle={2}
              >
                {methodPie.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) =>
                  Number(value).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {topPackages.length > 0 && (
        <ChartCard
          title="Top items by Gross"
          subtitle="From Transactions sheet"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={topPackages}
              margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis type="number" tickFormatter={moneyTick} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName || ""
                }
                formatter={(value) =>
                  Number(value).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                }
              />
              <Bar dataKey="Gross" fill="#1d4ed8" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
