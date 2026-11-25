#!/usr/bin/env bash
set -euo pipefail

operation=${1:-deploy}
case "$operation" in
  plan|deploy) ;;
  *) echo '::error::Expected a self-host operation of plan or deploy.'; exit 1 ;;
esac

main_ref=$(git ls-remote --exit-code origin refs/heads/main)
if [[ ${main_ref%%$'\t'*} != "${GITHUB_SHA:?}" ]]; then
  echo "::notice::Skipping $operation because this commit is no longer main."
  if [[ "$operation" == plan ]]; then exit 1; fi
  exit 0
fi

domain=openseo.ighenatt.es
worker=open-seo-selfhost
: "${CLOUDFLARE_API_TOKEN:?Set the Cloudflare deployment token in selfhost-production}"
: "${SELFHOST_ENV:?Set the current self-host configuration in selfhost-production}"
if [[ ! ${CLOUDFLARE_ACCOUNT_ID:-} =~ ^[a-f0-9]{32}$ ]]; then
  echo '::error::Set CLOUDFLARE_ACCOUNT_ID for selfhost-production.'
  exit 1
fi

umask 077
set -C
printf '%s\n' "$SELFHOST_ENV" > .env.selfhost
set +C
trap 'rm -f .env.selfhost' EXIT
unset SELFHOST_ENV

node --experimental-strip-types --input-type=module - "$domain" "$operation" <<'NODE'
import { appendFileSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { getSelfhostAdminEmails, normalizeEmailAddress, parseSelfhostAdminEmails } from './src/shared/selfhost-checks.ts';

const config = parseEnv(readFileSync('.env.selfhost', 'utf8'));
if (config.AUTH_MODE !== 'cloudflare_access' || config.CUSTOM_DOMAIN !== process.argv[2]) {
  throw new Error('SELFHOST_ENV must preserve Cloudflare Access and the production domain.');
}
if (config.DATABASE_PROVIDER && config.DATABASE_PROVIDER !== 'd1') {
  throw new Error('SELFHOST_ENV must use the existing D1 database provider.');
}
if (Boolean(config.TEAM_DOMAIN) !== Boolean(config.POLICY_AUD)) {
  throw new Error('Set both TEAM_DOMAIN and POLICY_AUD for managed-outside-Alchemy Access, or omit both.');
}
const configuredAdmins = process.env.SELFHOST_ADMIN_EMAILS || undefined;
const adminEmails = getSelfhostAdminEmails(configuredAdmins ?? config.SELFHOST_ADMIN_EMAILS, config.SELFHOST_ADMIN_EMAIL);
if (!adminEmails) {
  throw new Error('Set a valid SELFHOST_ADMIN_EMAILS list in the GitHub environment secret or SELFHOST_ENV.');
}
if (configuredAdmins && config.SELFHOST_ADMIN_EMAILS !== undefined) {
  const secretAdmins = parseSelfhostAdminEmails(config.SELFHOST_ADMIN_EMAILS);
  if (!secretAdmins || secretAdmins.length !== adminEmails.length ||
      !adminEmails.every((email) => secretAdmins.includes(email))) {
    throw new Error('SELFHOST_ADMIN_EMAILS differs between the separate GitHub secret and SELFHOST_ENV.');
  }
}
if (!(config.TEAM_DOMAIN && config.POLICY_AUD)) {
  const allowedEmails = (config.ACCESS_ALLOWED_EMAILS ?? '').split(',').map(normalizeEmailAddress);
  if (!adminEmails.every((email) => allowedEmails.includes(email))) {
    throw new Error('Every administrator must appear in ACCESS_ALLOWED_EMAILS for the managed Cloudflare Access application.');
  }
}
for (const name of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'ALCHEMY_PROFILE', 'SELFHOST_OPENROUTER_API_KEY']) {
  if (Object.hasOwn(config, name)) throw new Error(`Configure ${name} outside SELFHOST_ENV.`);
}
if (configuredAdmins && config.SELFHOST_ADMIN_EMAILS === undefined) {
  appendFileSync('.env.selfhost', `\nSELFHOST_ADMIN_EMAILS=${JSON.stringify(adminEmails.join(','))}\n`);
}
const openRouterKey = process.env.SELFHOST_OPENROUTER_API_KEY?.trim();
if (openRouterKey) {
  if (!/^sk-or-v1-[A-Za-z0-9_-]+$/.test(openRouterKey)) {
    throw new Error('Set OPENROUTER_API_KEY to a valid OpenRouter key in selfhost-production.');
  }
  const baseUrl = config.OPENROUTER_BASE_URL?.trim().replace(/\/+$/, '');
  if (baseUrl && baseUrl !== 'https://openrouter.ai/api/v1') {
    throw new Error('The separate OpenRouter key requires the default OpenRouter base URL.');
  }
  if (process.argv[3] === 'plan') {
    const keyStatus = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${openRouterKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!keyStatus.ok) throw new Error(`OpenRouter key check failed (HTTP ${keyStatus.status}).`);
    await keyStatus.body?.cancel();
    console.log('OpenRouter accepted the configured API key.');
  }
  appendFileSync('.env.selfhost', `\nSELFHOST_OPENROUTER_API_KEY=${openRouterKey}\n`);
}
NODE
unset SELFHOST_ADMIN_EMAILS SELFHOST_OPENROUTER_API_KEY

curl --fail --silent --show-error --max-time 20 \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/domains?hostname=$domain" \
  | jq -e --arg domain "$domain" --arg worker "$worker" \
    '.success and any(.result[]; .hostname == $domain and .service == $worker and .environment == "production")' \
    > /dev/null

if [[ "$operation" == plan ]]; then
  pnpm build:report-widgets
  pnpm exec vite build --mode selfhost
  pnpm exec tsc --noEmit
  pnpm alchemy plan deploy/alchemy/alchemy.run.ts --env-file .env.selfhost --stage selfhost
  exit 0
fi

pnpm deploy:selfhost --yes

for attempt in {1..6}; do
  if headers=$(curl --silent --show-error --max-time 15 --dump-header - --output /dev/null "https://$domain/"); then
    if grep -Eiq '^HTTP/[^ ]+ 401' <<< "$headers" &&
       grep -Eiq '^www-authenticate:.*cloudflare-access-protected-resource' <<< "$headers"; then
      exit 0
    fi
    if grep -Eiq '^HTTP/[^ ]+ 302' <<< "$headers" &&
       grep -Eiq '^location:[[:space:]]*https://[a-z0-9-]+\.cloudflareaccess\.com/cdn-cgi/access/login([?/#[:space:]]|$)' <<< "$headers"; then
      exit 0
    fi
  fi
  if (( attempt < 6 )); then sleep 10; fi
done

echo '::error::The production domain did not return a Cloudflare Access challenge after deployment.'
exit 1
