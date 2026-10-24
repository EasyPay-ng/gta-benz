#!/usr/bin/env bash
# Deploy the city server, surviving Cloudflare's own first-deploy race.
#
# The first `wrangler deploy` of a brand-new Worker does this, in order:
#   1. uploads the script  → "Uploaded metroventure-city (1.07 sec)"   ✅
#   2. reads /workers/workers/<name> to reconcile the workers.dev URL
# Step 2 can reach the API before the create from step 1 is visible, and Cloudflare
# answers `This Worker does not exist on your account. [code: 10007]`. wrangler treats
# that 404 as fatal, even though the upload it just did was fine.
#
# Because the upload already happened, simply deploying again shortly afterwards
# works. So: retry on 10007 only, with a generous backoff, and fail immediately on
# anything else (a bad token must not be retried four times).
#
# Env:
#   WRANGLER_CMD   command to run            (default: npx wrangler deploy)
#   DEPLOY_WAITS   seconds between attempts  (default: "10 20 40")
#   GITHUB_OUTPUT  written with url=… when set

set -o pipefail

WRANGLER_CMD="${WRANGLER_CMD:-npx wrangler deploy}"
DEPLOY_WAITS="${DEPLOY_WAITS:-10 20 40}"
read -r -a waits <<< "$DEPLOY_WAITS"
max_attempts=$(( ${#waits[@]} + 1 ))

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

is_race() {
  # Only the brand-new-Worker propagation race earns a retry.
  grep -qE 'code: 10007|This Worker does not exist on your account' "$LOG"
}

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  echo "── deploy attempt $attempt of $max_attempts ──"
  # shellcheck disable=SC2086
  if $WRANGLER_CMD 2>&1 | tee "$LOG"; then
    URL="$(grep -oE 'https://[A-Za-z0-9._-]+\.workers\.dev' "$LOG" | head -1)"
    echo
    echo "Deployed on attempt $attempt."
    if [ -n "$URL" ]; then
      echo "Server URL: $URL"
      if [ -n "${GITHUB_OUTPUT:-}" ]; then
        echo "url=$URL" >> "$GITHUB_OUTPUT"
      fi
    else
      echo "::warning::Deployed, but no workers.dev URL was found in the output. Check that the Worker has a URL enabled in the dashboard."
    fi
    exit 0
  fi

  if ! is_race; then
    echo "::error::wrangler deploy failed, and this is not the retryable first-deploy race. See the log above."
    exit 1
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    cat <<'MSG'
::error::Cloudflare kept reporting the brand-new Worker as missing (code 10007) even after retrying.
The script uploaded successfully each time; Cloudflare's settings API is behind. This is not a
problem with the repo, the token, or the account. Press "Re-run all jobs" on this run in a minute
and it will almost certainly succeed.
MSG
    exit 1
  fi

  wait_s="${waits[$((attempt - 1))]}"
  echo "::warning::First-deploy race: Cloudflare says the Worker does not exist yet (code 10007). The upload already succeeded, so waiting ${wait_s}s and deploying again."
  sleep "$wait_s"
  attempt=$((attempt + 1))
done
