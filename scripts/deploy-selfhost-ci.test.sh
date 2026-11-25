#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -f "$scratch/bin/git" "$scratch/bin/curl" "$scratch/bin/jq" "$scratch/bin/pnpm" "$scratch/src/shared/selfhost-checks.ts" "$scratch/calls"; rmdir "$scratch/bin" "$scratch/src/shared" "$scratch/src" "$scratch"' EXIT
mkdir -p "$scratch/bin" "$scratch/src/shared"
cp "$root/src/shared/selfhost-checks.ts" "$scratch/src/shared/"
cd "$scratch"

cat > bin/git <<'STUB'
#!/usr/bin/env bash
printf 'abc\trefs/heads/main\n'
STUB
cat > bin/curl <<'STUB'
#!/usr/bin/env bash
case "${*: -1}" in
  https://openseo.ighenatt.es/) printf 'HTTP/2 401\nWWW-Authenticate: cloudflare-access-protected-resource\n' ;;
  *) printf '{"success":true}\n' ;;
esac
STUB
cat > bin/jq <<'STUB'
#!/usr/bin/env bash
cat >/dev/null
STUB
cat > bin/pnpm <<'STUB'
#!/usr/bin/env bash
set -e
printf '%s\n' "$*" >> calls
grep -qx 'DATAFORSEO_API_KEY=fixture-secret' .env.selfhost
grep -qxF "$EXPECTED_ADMIN_LINE" .env.selfhost
STUB
chmod +x bin/git bin/curl bin/jq bin/pnpm
export PATH="$scratch/bin:$PATH"
export GITHUB_SHA=abc CLOUDFLARE_API_TOKEN=fixture
export CLOUDFLARE_ACCOUNT_ID=11111111111111111111111111111111
export SELFHOST_ENV=$'AUTH_MODE=cloudflare_access\nCUSTOM_DOMAIN=openseo.ighenatt.es\nACCESS_ALLOWED_EMAILS=admin@example.com,second@example.com\nDATAFORSEO_API_KEY=fixture-secret\nSELFHOST_ADMIN_EMAIL=admin@example.com'
export SELFHOST_ADMIN_EMAILS=' Admin@Example.com , second@example.com '
export EXPECTED_ADMIN_LINE='SELFHOST_ADMIN_EMAILS="admin@example.com,second@example.com"'

bash "$root/scripts/deploy-selfhost-ci.sh" plan
grep -qx 'alchemy plan deploy/alchemy/alchemy.run.ts --env-file .env.selfhost --stage selfhost' calls
if grep -q 'deploy:selfhost' calls; then
  echo 'Planning must not invoke deployment.' >&2
  exit 1
fi
test ! -e .env.selfhost

: > calls
unset SELFHOST_ADMIN_EMAILS
export EXPECTED_ADMIN_LINE='SELFHOST_ADMIN_EMAIL=admin@example.com'
bash "$root/scripts/deploy-selfhost-ci.sh" deploy
test "$(cat calls)" = 'deploy:selfhost --yes'
test ! -e .env.selfhost

: > calls
if SELFHOST_ADMIN_EMAILS='admin@example.com,unknown@example.com' bash "$root/scripts/deploy-selfhost-ci.sh" plan 2>/dev/null; then
  echo 'Planning must reject administrators missing from the Access allowlist.' >&2
  exit 1
fi
test ! -s calls
test ! -e .env.selfhost
