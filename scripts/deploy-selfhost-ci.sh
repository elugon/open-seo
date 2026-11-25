#!/usr/bin/env bash
set -euo pipefail

main_ref=$(git ls-remote --exit-code origin refs/heads/main)
if [[ ${main_ref%%$'\t'*} != "${GITHUB_SHA:?}" ]]; then
  echo '::notice::Skipping deployment because this commit is no longer main.'
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

node --input-type=module - "$domain" <<'NODE'
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

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
const adminEmail = config.SELFHOST_ADMIN_EMAIL?.trim().toLowerCase();
if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  throw new Error('SELFHOST_ENV must set a valid SELFHOST_ADMIN_EMAIL for the initial Cloudflare Access administrator.');
}
if (!(config.TEAM_DOMAIN && config.POLICY_AUD)) {
  const allowedEmails = (config.ACCESS_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedEmails.includes(adminEmail)) {
    throw new Error('SELFHOST_ADMIN_EMAIL must also appear in ACCESS_ALLOWED_EMAILS for the managed Cloudflare Access application.');
  }
}
for (const name of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'ALCHEMY_PROFILE']) {
  if (Object.hasOwn(config, name)) throw new Error(`Configure ${name} outside SELFHOST_ENV.`);
}
NODE

curl --fail --silent --show-error --max-time 20 \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/domains?hostname=$domain" \
  | jq -e --arg domain "$domain" --arg worker "$worker" \
    '.success and any(.result[]; .hostname == $domain and .service == $worker and .environment == "production")' \
    > /dev/null

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
