/**
 * Posts sync updates to Slack.
 *
 * Preferred: SLACK_BOT_TOKEN + SLACK_CHANNEL (channel ID like C… or name like #gatp-syncs)
 * Fallback:  SLACK_WEBHOOK_URL (Incoming Webhook)
 *
 * Bot needs chat:write and must be invited to the channel (/invite @YourBot).
 */

async function postViaBot(payload) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL || process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) return null;

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      text: payload.text,
      blocks: payload.blocks,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(
      `Slack API error: ${data.error || res.statusText || 'unknown'}`
    );
  }
  return { ok: true, via: 'bot' };
}

async function postViaWebhook(payload) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return null;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack webhook failed (${res.status}): ${body || res.statusText}`);
  }
  return { ok: true, via: 'webhook' };
}

async function postToSlack(payload) {
  const botResult = await postViaBot(payload);
  if (botResult) return botResult;

  const hookResult = await postViaWebhook(payload);
  if (hookResult) return hookResult;

  console.log(
    '[slack] skipped (set SLACK_BOT_TOKEN + SLACK_CHANNEL or SLACK_WEBHOOK_URL)'
  );
  return { skipped: true };
}

function sellerLabel(seller, sellerName) {
  if (sellerName) return String(sellerName);
  if (!seller) return 'unknown';
  if (typeof seller === 'object') {
    return seller.name || seller.email || seller.id || 'unknown';
  }
  return String(seller);
}

function formatExportSuccess({
  type,
  from,
  to,
  seller,
  sellerName,
  rowCount,
  sheetNames,
  flow,
}) {
  const who = sellerLabel(seller, sellerName);
  const sheets = Array.isArray(sheetNames) ? sheetNames.join(', ') : '—';
  const flowLabel = flow === 'automate' ? 'Automate sync' : 'Report export';

  return {
    text: `${flowLabel} succeeded for ${who}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `✅ ${flowLabel} complete`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Seller*\n${who}` },
          { type: 'mrkdwn', text: `*Type*\n${type || '—'}` },
          { type: 'mrkdwn', text: `*Range*\n${from || '—'} → ${to || '—'}` },
          { type: 'mrkdwn', text: `*Rows*\n${rowCount ?? '—'}` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Sheets: ${sheets}` }],
      },
    ],
  };
}

function formatExportFailure({ type, from, to, seller, sellerName, error, flow }) {
  const who = sellerLabel(seller, sellerName);
  const flowLabel = flow === 'automate' ? 'Automate sync' : 'Report export';

  return {
    text: `${flowLabel} failed for ${who}: ${error}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `❌ ${flowLabel} failed`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Seller*\n${who}` },
          { type: 'mrkdwn', text: `*Type*\n${type || '—'}` },
          { type: 'mrkdwn', text: `*Range*\n${from || '—'} → ${to || '—'}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Error*\n\`\`\`${error || 'Unknown error'}\`\`\`` },
      },
    ],
  };
}

function formatSyncComplete({
  type,
  from,
  to,
  seller,
  sellerName,
  rowCount,
  qbStatus,
  journalLines,
}) {
  const who = sellerLabel(seller, sellerName);

  return {
    text: `Full sync complete for ${who}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔄 Full sync complete', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Seller*\n${who}` },
          { type: 'mrkdwn', text: `*Type*\n${type || '—'}` },
          { type: 'mrkdwn', text: `*Range*\n${from || '—'} → ${to || '—'}` },
          { type: 'mrkdwn', text: `*Rows*\n${rowCount ?? '—'}` },
          { type: 'mrkdwn', text: `*QuickBooks*\n${qbStatus || 'demo prepared'}` },
          {
            type: 'mrkdwn',
            text: `*Journal lines*\n${journalLines ?? '—'}`,
          },
        ],
      },
    ],
  };
}

function formatQuickBooksResult({
  seller,
  sellerName,
  status,
  journalId,
  lineCount,
  error,
}) {
  const who = sellerLabel(seller, sellerName);
  const ok = !error && status !== 'failed';

  return {
    text: ok
      ? `QuickBooks import ${status || 'done'} for ${who}`
      : `QuickBooks import failed for ${who}: ${error}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ok ? '📘 QuickBooks update' : '❌ QuickBooks failed',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Seller*\n${who}` },
          { type: 'mrkdwn', text: `*Status*\n${status || (ok ? 'ok' : 'failed')}` },
          ...(journalId
            ? [{ type: 'mrkdwn', text: `*Journal ID*\n${journalId}` }]
            : []),
          ...(lineCount != null
            ? [{ type: 'mrkdwn', text: `*Lines*\n${lineCount}` }]
            : []),
        ],
      },
      ...(error
        ? [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Error*\n\`\`\`${error}\`\`\`` },
            },
          ]
        : []),
    ],
  };
}

/** Fire-and-forget helper — never throws to callers of sync routes. */
function notifySlackSafe(payloadBuilder) {
  return Promise.resolve()
    .then(() => {
      const payload =
        typeof payloadBuilder === 'function' ? payloadBuilder() : payloadBuilder;
      return postToSlack(payload);
    })
    .catch((err) => {
      console.error('[slack]', err.message || err);
      return { ok: false, error: err.message };
    });
}

module.exports = {
  postToSlack,
  notifySlackSafe,
  formatExportSuccess,
  formatExportFailure,
  formatSyncComplete,
  formatQuickBooksResult,
};
