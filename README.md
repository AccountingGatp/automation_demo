# GATP Demo

Next.js frontend and Express.js backend.

## Structure

```
demo/
├── frontend/   # Next.js (App Router, TypeScript, Tailwind)
├── backend/    # Express.js API
└── package.json
```

## Setup

```bash
# Install dependencies for both apps
npm run install:all
```

Or install each separately:

```bash
cd backend && npm install
cd ../frontend && npm install
```

For sync log storage, add MongoDB in `backend/.env`:

```bash
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
```

## Run

Start the API (port **5000**):

```bash
npm run dev:backend
# or: cd backend && npm run dev
```

Start the frontend (port **3000**):

```bash
npm run dev:frontend
# or: cd frontend && npm run dev
```

## Xola report viewer

1. Start backend and frontend (`npm run dev` in each folder).
2. Open http://localhost:3000
3. Pick a seller, date range, and report type, then **Fetch report**.
4. Explore sheets (Transactions / Summary), search, sort, and page through rows.

The workbook is parsed in memory only — nothing is written to disk.

### Sync logs

The backend stores sync/export/QuickBooks status entries in MongoDB and the frontend exposes them at `/logs`.

- Success and failure events are saved automatically.
- The logs page highlights recent updates and failures.
- If `MONGODB_URI` is missing, the app still runs but log storage is disabled.

### Env (`backend/.env`)

```
XOLA_API_KEY=your_key
XOLA_BASE=https://xola.com/api
MONGODB_URI=mongodb+srv://...

# Optional — post to a Slack channel on every sync
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL=#gatp-syncs
```

### Slack sync notifications

On each **Fetch report** or **Automate all** finish, the backend posts a summary to your Slack channel.

**Bot token (recommended)**

1. Slack app → **OAuth & Permissions** → add scope `chat:write`
2. **Install to workspace** and copy the **Bot User OAuth Token** (`xoxb-…`)
3. In the target channel, run `/invite @YourBot`
4. Set `SLACK_BOT_TOKEN` and `SLACK_CHANNEL` (`#channel-name` or channel ID `C…`) in `backend/.env`
5. Restart the backend

**Or** use `SLACK_WEBHOOK_URL` (Incoming Webhook) instead.

If Slack env vars are missing, sync still works — notifications are skipped.
