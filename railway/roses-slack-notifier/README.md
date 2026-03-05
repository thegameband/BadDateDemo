# Roses Slack Notifier (Railway)

Small Railway service that receives rose-award callbacks and posts one-line messages to a dedicated Slack channel.

## What it does

- Accepts `POST /notify/rose` from the BadDate Roses API.
- Sends a one-line message into Slack:
  - `{Profile Name} just got a Rose! They have {x} roses, in {position}/{total} place.`
- Supports shared-secret auth via `x-roses-notifier-secret`.

## Deploy to Railway

1. Create a new Railway project.
2. Deploy this folder: `railway/roses-slack-notifier`.
3. Set Railway start command to: `npm start` (or rely on package scripts).
4. Add Railway env vars:
   - `SLACK_BOT_TOKEN`
   - `SLACK_CHANNEL_ID`
   - `NOTIFIER_SHARED_SECRET` (recommended)
5. Confirm health endpoint:
   - `GET https://<your-railway-domain>/healthz`

## Slack app requirements

1. Create a Slack app in your workspace.
2. Add bot scope: `chat:write`.
3. Install app to workspace.
4. Invite bot to your target channel.
5. Use the channel ID as `SLACK_CHANNEL_ID` (looks like `C...`).

## BadDate env vars (set in Vercel)

- `ROSES_SLACK_NOTIFIER_URL` = `https://<your-railway-domain>/notify/rose`
- `ROSES_SLACK_NOTIFIER_SECRET` = same value as Railway `NOTIFIER_SHARED_SECRET`

If `ROSES_SLACK_NOTIFIER_URL` is missing, BadDate skips Slack notifier calls.
