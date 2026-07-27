const apiKey = process.env.XOLA_API_KEY;
const base = process.env.XOLA_BASE || 'https://xola.com/api';
const delegatorLimit = Number(process.env.DELEGATOR_LIMIT || 100);
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 3000);
const pollMaxAttempts = Number(process.env.POLL_MAX_ATTEMPTS || 60);

const apiHeaders = { 'X-API-KEY': apiKey };

// Browser-like headers used when pulling the generated file from S3.
const downloadHeaders = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0',
};

const ACCOUNT_TYPES =
  'purchase,refund,refund_commission,deposit,balance,purchase_affiliate,redeem,plugin_fee';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertConfig() {
  if (!apiKey) {
    throw new Error('XOLA_API_KEY is not set');
  }
}

async function fetchDelegators(limit = delegatorLimit) {
  assertConfig();
  const res = await fetch(`${base}/delegators?limit=${limit}`, {
    method: 'GET',
    headers: apiHeaders,
  });
  if (!res.ok) {
    throw new Error(`fetchDelegators failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.data || [];
}

function buildExportUrl(type, from, to, seller) {
  const range = `${from}T00:00:00,${to}T23:59:59`;
  const params = new URLSearchParams({
    format: 'xlsx',
    'createdAt[range]': range,
    seller,
  });

  if (type === 'payout') {
    params.set('context', 'payout_report');
  } else {
    params.set('type[in]', ACCOUNT_TYPES);
  }

  return `${base}/transactions?${params.toString()}`;
}

async function createExport(type, from, to, seller) {
  assertConfig();
  const url = buildExportUrl(type, from, to, seller);
  const res = await fetch(url, { method: 'GET', headers: apiHeaders });
  if (!res.ok) {
    throw new Error(
      `export failed: ${res.status} ${res.statusText} ${await res.text()}`
    );
  }
  return res.json();
}

function resolveFileUrl(job) {
  return (
    job?.url ||
    job?.data?.url ||
    job?.fileUrl ||
    job?.downloadUrl ||
    null
  );
}

async function waitForFile(fileUrl, onTick) {
  for (let attempt = 1; attempt <= pollMaxAttempts; attempt++) {
    const res = await fetch(fileUrl, { method: 'HEAD', headers: downloadHeaders });
    if (onTick) onTick(attempt, res.status);

    if (res.ok) return true;

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `export file was not ready after ${pollMaxAttempts} attempts ` +
      `(~${Math.round((pollMaxAttempts * pollIntervalMs) / 1000)}s)`
  );
}

async function downloadBuffer(fileUrl) {
  const res = await fetch(fileUrl, { method: 'GET', headers: downloadHeaders });
  if (!res.ok) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Create one export, wait until S3 has it, download into memory (no disk write).
 */
async function exportWorkbookBuffer(type, from, to, seller, onTick) {
  const job = await createExport(type, from, to, seller);
  const fileUrl = resolveFileUrl(job);
  if (!fileUrl) {
    throw new Error(
      `Export job did not return a file URL. Keys: ${Object.keys(job || {}).join(', ')}`
    );
  }

  await waitForFile(fileUrl, onTick);
  const buffer = await downloadBuffer(fileUrl);
  return { buffer, fileUrl, job };
}

module.exports = {
  fetchDelegators,
  createExport,
  waitForFile,
  downloadBuffer,
  exportWorkbookBuffer,
  resolveFileUrl,
};
