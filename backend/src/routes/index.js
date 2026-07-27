const express = require('express');
const {
  fetchDelegators,
  exportWorkbookBuffer,
} = require('../services/xolaExport');
const { parseWorkbook } = require('../services/parseWorkbook');
const { importToQuickBooks } = require('../services/quickbooksImport');
const { createSyncLog, listSyncLogs } = require('../services/syncLogger');
const {
  notifySlackSafe,
  formatExportSuccess,
  formatExportFailure,
  formatSyncComplete,
  formatQuickBooksResult,
} = require('../services/slackNotify');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    message: 'Welcome to the API',
    version: '1.0.0',
  });
});

router.get('/hello', (_req, res) => {
  res.json({
    message: 'Hello from Express!',
  });
});

router.get('/logs', async (req, res) => {
  try {
    const { status, event, limit } = req.query;
    const result = await listSyncLogs({ status, event, limit });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to load logs' });
  }
});

router.get('/delegators', async (_req, res) => {
  try {
    const list = await fetchDelegators();
    const sellers = list.map((d) => ({
      id: d.id || d._id,
      name:
        d.name ||
        d.company ||
        d.organization?.name ||
        d.email ||
        String(d.id || d._id),
      email: d.email || null,
    }));
    res.json({ data: sellers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to fetch delegators' });
  }
});

router.post('/reports/export', async (req, res) => {
  // Xola export can take a few minutes
  req.setTimeout(5 * 60 * 1000);
  res.setTimeout(5 * 60 * 1000);

  const { type = 'account', from, to, seller, sellerName, flow } = req.body || {};

  try {
    if (!from || !to || !seller) {
      return res.status(400).json({
        error: 'from, to, and seller are required (YYYY-MM-DD dates)',
      });
    }

    if (!['account', 'payout'].includes(type)) {
      return res.status(400).json({ error: 'type must be account or payout' });
    }

    console.log(`[export] starting ${type} ${from}→${to} seller=${seller}`);

    const { buffer, fileUrl } = await exportWorkbookBuffer(
      type,
      from,
      to,
      seller,
      (attempt, status) => {
        console.log(`[export] poll #${attempt} status=${status}`);
      }
    );

    const parsed = parseWorkbook(buffer);

    // Automate flow sends one Slack message at the end via /slack/notify
    if (flow !== 'automate') {
      notifySlackSafe(() =>
        formatExportSuccess({
          type,
          from,
          to,
          seller,
          sellerName,
          rowCount: parsed.rows.length,
          sheetNames: parsed.sheetNames,
          flow: flow || 'export',
        })
      );
    }

    createSyncLog({
      event: 'export',
      status: 'success',
      flow: flow || 'export',
      message: `${flow === 'automate' ? 'Automate export' : 'Report export'} completed`,
      seller: {
        id: seller,
        name: sellerName || seller,
      },
      report: {
        type,
        from,
        to,
        rowCount: parsed.rows.length,
        sheetNames: parsed.sheetNames,
      },
      meta: {
        sourceUrl: fileUrl,
      },
    });

    res.json({
      meta: {
        type,
        from,
        to,
        seller,
        sellerName,
        sheetName: parsed.sheetName,
        sheetNames: parsed.sheetNames,
        rowCount: parsed.rows.length,
        // Informational only — workbook stays in memory, nothing saved to disk
        sourceUrl: fileUrl,
      },
      headers: parsed.headers,
      rows: parsed.rows,
      sheets: parsed.sheets,
    });
  } catch (err) {
    console.error(err);
    notifySlackSafe(() =>
      formatExportFailure({
        type,
        from,
        to,
        seller,
        sellerName,
        error: err.message || 'Export failed',
        flow: flow || 'export',
      })
    );
    createSyncLog({
      event: 'export',
      status: 'failed',
      flow: flow || 'export',
      message: `${flow === 'automate' ? 'Automate export' : 'Report export'} failed`,
      seller: {
        id: seller,
        name: sellerName || seller,
      },
      report: {
        type,
        from,
        to,
      },
      error: {
        message: err.message || 'Export failed',
        stack: err.stack || '',
      },
    });
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

router.post('/quickbooks/import', async (req, res) => {
  try {
    const { sheets, meta } = req.body || {};
    if (!Array.isArray(sheets) || !sheets.length) {
      return res.status(400).json({ error: 'sheets are required' });
    }

    const result = await importToQuickBooks({ sheets, meta: meta || {} });
    createSyncLog({
      event: 'quickbooks',
      status: 'success',
      flow: meta?.flow || 'quickbooks',
      message: 'QuickBooks import completed',
      seller: {
        id: meta?.seller,
        name: meta?.sellerName || meta?.seller,
      },
      report: {
        type: meta?.type,
        from: meta?.from,
        to: meta?.to,
        rowCount: meta?.rowCount,
      },
      quickbooks: {
        status: result.status,
        journalId: result.journalId || result.Id,
        lineCount: result.lines?.length ?? result.lineCount,
      },
    });
    notifySlackSafe(() =>
      formatQuickBooksResult({
        seller: meta?.seller,
        sellerName: meta?.sellerName,
        status: result.status,
        journalId: result.journalId || result.Id,
        lineCount: result.lines?.length ?? result.lineCount,
      })
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    notifySlackSafe(() =>
      formatQuickBooksResult({
        seller: req.body?.meta?.seller,
        sellerName: req.body?.meta?.sellerName,
        status: 'failed',
        error: err.message || 'QuickBooks import failed',
      })
    );
    createSyncLog({
      event: 'quickbooks',
      status: 'failed',
      flow: req.body?.meta?.flow || 'quickbooks',
      message: 'QuickBooks import failed',
      seller: {
        id: req.body?.meta?.seller,
        name: req.body?.meta?.sellerName || req.body?.meta?.seller,
      },
      report: {
        type: req.body?.meta?.type,
        from: req.body?.meta?.from,
        to: req.body?.meta?.to,
        rowCount: req.body?.meta?.rowCount,
      },
      error: {
        message: err.message || 'QuickBooks import failed',
        stack: err.stack || '',
      },
    });
    res.status(500).json({ error: err.message || 'QuickBooks import failed' });
  }
});

/** Client-driven Slack update (e.g. Automate all finished). */
router.post('/slack/notify', async (req, res) => {
  try {
    const {
      event = 'sync_complete',
      type,
      from,
      to,
      seller,
      sellerName,
      rowCount,
      qbStatus,
      journalLines,
      error,
    } = req.body || {};

    if (event === 'sync_failed' || error) {
      await notifySlackSafe(() =>
        formatExportFailure({
          type,
          from,
          to,
          seller,
          sellerName,
          error: error || 'Sync failed',
          flow: 'automate',
        })
      );
      await createSyncLog({
        event: 'sync',
        status: 'failed',
        flow: 'automate',
        message: 'Full automation sync failed',
        seller: {
          id: seller,
          name: sellerName || seller,
        },
        report: {
          type,
          from,
          to,
        },
        error: {
          message: error || 'Sync failed',
        },
      });
    } else {
      await notifySlackSafe(() =>
        formatSyncComplete({
          type,
          from,
          to,
          seller,
          sellerName,
          rowCount,
          qbStatus,
          journalLines,
        })
      );
      await createSyncLog({
        event: 'sync',
        status: 'success',
        flow: 'automate',
        message: 'Full automation sync completed',
        seller: {
          id: seller,
          name: sellerName || seller,
        },
        report: {
          type,
          from,
          to,
          rowCount,
        },
        quickbooks: {
          status: qbStatus,
          lineCount: journalLines,
        },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Slack notify failed' });
  }
});

module.exports = router;
