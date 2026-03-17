#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Generate .env.local from environment variables (GitHub Codespaces Secrets)
if [ ! -f .env.local ]; then
  cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}
NEXT_PUBLIC_APP_URL=https://zenshin-web-alpha.vercel.app
# Resend
RESEND_API_KEY=${RESEND_API_KEY:-}
RESEND_FROM_EMAIL=ZENSHIN CHART <noreply@u2c.io>
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
# Cron (Tree Snapshot 自動取得)
CRON_SECRET=${CRON_SECRET:-}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-}
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-}
# AI Model Configuration
AI_MODEL_PRIMARY=claude-sonnet-4-5
AI_MODEL_LIGHT=claude-sonnet-4-20250514
# Slack App (OAuth)
SLACK_CLIENT_ID=${SLACK_CLIENT_ID:-}
SLACK_CLIENT_SECRET=${SLACK_CLIENT_SECRET:-}
SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET:-}
EOF
  echo "Generated .env.local from environment secrets"
fi

# Install dependencies
npm install
