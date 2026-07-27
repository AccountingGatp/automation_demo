const XLSX = require('xlsx');

function nonemptyCount(row) {
  if (!Array.isArray(row)) return 0;
  return row.filter((c) => c != null && String(c).trim() !== '').length;
}

/**
 * Pick the first row that looks like a real column header row
 * (several non-empty cells), instead of title/metadata rows.
 */
function findHeaderRowIndex(matrix) {
  let bestIdx = 0;
  let bestScore = -1;

  const limit = Math.min(matrix.length, 30);
  for (let i = 0; i < limit; i++) {
    const row = matrix[i] || [];
    const filled = nonemptyCount(row);
    if (filled < 2) continue;

    // Prefer rows where most cells are short-ish labels (strings).
    const stringish = row.filter(
      (c) => typeof c === 'string' && c.trim() !== '' && c.length < 60
    ).length;

    const score = filled * 2 + stringish;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function matrixToTable(matrix) {
  if (!matrix.length) {
    return { headers: [], rows: [], headerRowIndex: 0 };
  }

  const headerRowIndex = findHeaderRowIndex(matrix);
  const headerCells = matrix[headerRowIndex] || [];
  const width = Math.max(
    headerCells.length,
    ...matrix.slice(headerRowIndex + 1, headerRowIndex + 50).map((r) => (r || []).length),
    1
  );

  const headers = Array.from({ length: width }, (_, i) => {
    const h = headerCells[i];
    return h == null || String(h).trim() === '' ? `Column ${i + 1}` : String(h).trim();
  });

  const rows = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const line = matrix[r] || [];
    if (nonemptyCount(line) === 0) continue;

    const row = { __row: rows.length + 1 };
    headers.forEach((header, i) => {
      // Deduplicate keys if needed
      const key = header;
      row[key] = line[i] ?? null;
    });
    rows.push(row);
  }

  return { headers, rows, headerRowIndex };
}

function scoreSheet(parsed, name) {
  // Prefer the Transactions sheet, then widest useful tables.
  const nameBoost = /transaction/i.test(name)
    ? 100000
    : /summary/i.test(name)
      ? 1000
      : 0;
  return nameBoost + parsed.rows.length * 10 + parsed.headers.length;
}

/**
 * Parse an xlsx buffer in memory into all sheets + a default selection.
 * Never writes to disk.
 */
function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });
    const table = matrixToTable(matrix);
    return {
      sheetName,
      headers: table.headers,
      rows: table.rows,
      headerRowIndex: table.headerRowIndex,
    };
  });

  let defaultIndex = 0;
  let best = -1;
  sheets.forEach((s, i) => {
    const score = scoreSheet(s, s.sheetName);
    if (score > best) {
      best = score;
      defaultIndex = i;
    }
  });

  const selected = sheets[defaultIndex] || {
    sheetName: null,
    headers: [],
    rows: [],
  };

  return {
    sheetName: selected.sheetName,
    sheetNames: workbook.SheetNames,
    headers: selected.headers,
    rows: selected.rows,
    sheets: sheets.map((s) => ({
      sheetName: s.sheetName,
      headers: s.headers,
      rows: s.rows,
      rowCount: s.rows.length,
    })),
  };
}

module.exports = { parseWorkbook };
