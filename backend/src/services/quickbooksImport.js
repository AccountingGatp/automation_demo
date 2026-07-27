/**
 * Build a QuickBooks-ready sales revenue journal from the Xola Summary sheet.
 * Does not require live QBO OAuth for the demo — returns a structured payload
 * plus a CSV that can be imported / reviewed in QuickBooks.
 */

function parseMoney(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function findHeader(headers, patterns) {
  for (const pattern of patterns) {
    const hit = headers.find((h) => pattern.test(h));
    if (hit) return hit;
  }
  return null;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function buildJournalFromSummary(sheets, meta = {}) {
  const summary =
    (sheets || []).find((s) => /summary/i.test(s.sheetName)) || null;

  if (!summary || !summary.rows?.length) {
    throw new Error('Summary sheet is required to import into QuickBooks');
  }

  const methodCol = findHeader(summary.headers, [/^method$/i, /method/i]);
  const grossCol = findHeader(summary.headers, [/^gross$/i, /gross/i]);
  const netCol = findHeader(summary.headers, [/^net$/i, /net/i]);
  const processingCol = findHeader(summary.headers, [
    /processing fee/i,
    /processing/i,
  ]);
  const serviceCol = findHeader(summary.headers, [/service fee/i]);
  const guestCol = findHeader(summary.headers, [/guest fee/i]);

  if (!methodCol || !grossCol) {
    throw new Error('Summary sheet is missing Method / Gross columns');
  }

  const lines = [];
  let totalGross = 0;
  let totalNet = 0;
  let totalFees = 0;

  for (const row of summary.rows) {
    const method = String(row[methodCol] ?? '').trim();
    if (!method) continue;

    const gross = parseMoney(row[grossCol]) ?? 0;
    const net = netCol ? parseMoney(row[netCol]) ?? 0 : 0;
    const processing = processingCol ? parseMoney(row[processingCol]) ?? 0 : 0;
    const service = serviceCol ? parseMoney(row[serviceCol]) ?? 0 : 0;
    const guest = guestCol ? parseMoney(row[guestCol]) ?? 0 : 0;
    const fees = processing + service + guest;

    if (gross === 0 && net === 0 && fees === 0) continue;

    totalGross += gross;
    totalNet += net;
    totalFees += fees;

    // Balanced entry per payment method:
    // Debit Clearing (Net) + Debit Fee Expense (Fees) = Credit Sales (Gross)
    // When Net + Fees != Gross (refunds / adjustments), use Gross as credit
    // and put residual on Clearing.
    const creditSales = gross;
    const debitFees = fees;
    let debitClearing = round2(creditSales - debitFees);
    // Prefer reported Net when it is close to the residual
    if (netCol && Math.abs(net - debitClearing) < 0.02) {
      debitClearing = net;
    }

    if (debitClearing !== 0) {
      lines.push({
        method,
        account: 'Undeposited Funds',
        postingType: debitClearing >= 0 ? 'Debit' : 'Credit',
        amount: Math.abs(round2(debitClearing)),
        memo: `Xola ${method} clearing`,
      });
    }

    if (debitFees !== 0) {
      lines.push({
        method,
        account: 'Merchant Fees',
        postingType: debitFees >= 0 ? 'Debit' : 'Credit',
        amount: Math.abs(round2(debitFees)),
        memo: `Xola ${method} fees`,
      });
    }

    if (creditSales !== 0) {
      lines.push({
        method,
        account: 'Sales Revenue',
        postingType: creditSales >= 0 ? 'Credit' : 'Debit',
        amount: Math.abs(round2(creditSales)),
        memo: `Xola ${method} sales`,
      });
    }
  }

  if (!lines.length) {
    throw new Error('No Summary rows with amounts to import');
  }

  const docNumber = `XOLA-${(meta.from || '').replace(/-/g, '')}-${(meta.to || '').replace(/-/g, '')}`;
  const txnDate = meta.to || new Date().toISOString().slice(0, 10);

  const journal = {
    DocNumber: docNumber,
    TxnDate: txnDate,
    PrivateNote: `Xola ${meta.type || 'account'} import ${meta.from || ''} → ${meta.to || ''} seller=${meta.seller || ''}`,
    Line: lines.map((line, i) => ({
      Id: String(i + 1),
      Description: line.memo,
      Amount: line.amount,
      DetailType: 'JournalEntryLineDetail',
      JournalEntryLineDetail: {
        PostingType: line.postingType,
        AccountRef: { name: line.account },
      },
      meta: { method: line.method, account: line.account },
    })),
  };

  const totals = {
    gross: round2(totalGross),
    net: round2(totalNet),
    fees: round2(totalFees),
    lineCount: lines.length,
  };

  return { journal, lines, totals, docNumber, txnDate };
}

function journalToCsv(journal, lines) {
  const header = [
    'DocNumber',
    'TxnDate',
    'PostingType',
    'Account',
    'Amount',
    'Memo',
    'Method',
  ];
  const rows = lines.map((line) =>
    [
      journal.DocNumber,
      journal.TxnDate,
      line.postingType,
      line.account,
      line.amount.toFixed(2),
      `"${String(line.memo).replace(/"/g, '""')}"`,
      `"${String(line.method).replace(/"/g, '""')}"`,
    ].join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

/**
 * Import (or prepare) a QuickBooks journal entry from report sheets.
 * Live QBO post runs only when QB_ACCESS_TOKEN + QB_REALM_ID are configured.
 */
async function importToQuickBooks({ sheets, meta }) {
  const built = buildJournalFromSummary(sheets, meta);
  const csv = journalToCsv(built.journal, built.lines);

  const token = process.env.QB_ACCESS_TOKEN;
  const realmId = process.env.QB_REALM_ID;
  const base =
    process.env.QB_API_BASE || 'https://quickbooks.api.intuit.com';

  let qbo = null;
  if (token && realmId) {
    const res = await fetch(
      `${base}/v3/company/${realmId}/journalentry?minorversion=65`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(built.journal),
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        body?.Fault?.Error?.[0]?.Message ||
          body?.fault?.error?.[0]?.message ||
          `QuickBooks API error ${res.status}`
      );
    }
    qbo = {
      id: body?.JournalEntry?.Id,
      syncToken: body?.JournalEntry?.SyncToken,
    };
  }

  return {
    status: qbo ? 'posted' : 'prepared',
    message: qbo
      ? 'Journal entry posted to QuickBooks Online'
      : 'Journal entry prepared for QuickBooks (connect QB_ACCESS_TOKEN + QB_REALM_ID to post live)',
    docNumber: built.docNumber,
    txnDate: built.txnDate,
    totals: built.totals,
    lines: built.lines,
    journal: built.journal,
    csv,
    qbo,
  };
}

module.exports = {
  buildJournalFromSummary,
  importToQuickBooks,
};
