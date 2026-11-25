# Cloudflare Self-Hosting

Host OpenSEO on Cloudflare for internet-facing self-hosting across multiple devices or with your team. One deploy command provisions everything. Works on Cloudflare's free plan, with [limits](#workers-free-plan-limits): site audits stop at about 40 pages.

You sign in with email and password accounts: the first visitor creates the administrator's account, teammates join from invitation links, and MCP clients (Claude, ChatGPT, Codex, Cursor) sign in with the same accounts, with nothing to set up in Cloudflare. The most secure option is to put [Cloudflare Access](#cloudflare-access-the-most-secure-option) in front of the app instead, so Cloudflare checks every request before it reaches OpenSEO. It takes more setup.

Related guides:

- [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md): connect the MCP server, manage accounts, telemetry.
- [Legacy deployments](./SELF_HOSTING_CLOUDFLARE_LEGACY.md): maintenance for installs created with the retired Deploy-button or manual Wrangler flows.

## Prerequisites

- **Node 22.6 or newer** and **pnpm** (`corepack enable` sets it up).
- **A Cloudflare account with R2 enabled.** Activating R2 requires a payment method on file, even within its free tier — if you have never used R2, open `R2` in the Cloudflare dashboard once.
- **A workers.dev subdomain.** A new account has none until you open `Workers & Pages` in the Cloudflare dashboard once; without it the bootstrap below fails with "You need a workers.dev subdomain". The subdomain becomes part of your OpenSEO URL.
- **A DataForSEO account** (or a [treg token](./DATAFORSEO_API_KEY.md#no-dataforseo-account-use-treg)) — see [`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md).

## 1) Clone your OpenSEO repo

Fork `every-app/open-seo` on GitHub if you want a repo you control, then clone it locally:

```bash
git clone https://github.com/YOUR_GITHUB_USER/open-seo.git
cd open-seo
corepack enable
pnpm install
```

If you do not need a fork, clone the upstream repo instead:

```bash
git clone https://github.com/every-app/open-seo.git
cd open-seo
corepack enable
pnpm install
```

## 2) Log in to Cloudflare (once)

```bash
pnpm alchemy login deploy/alchemy/alchemy.run.ts # the default scopes are enough
pnpm alchemy cloudflare bootstrap                # deploys alchemy's state-store Worker to your account
```

## 3) Create `.env.selfhost`

Copy the template and set `DATAFORSEO_API_KEY` (or `TREG_API_TOKEN`); everything else is optional:

```bash
cp deploy/.env.selfhost.example .env.selfhost
```

## 4) Deploy

```bash
pnpm deploy:selfhost --yes
```

This provisions the D1 database, KV namespaces, and R2 bucket, applies the database migrations, deploys the Workers, and generates the session secret. The secret is kept in Alchemy's state in your account, so later deploys keep everyone signed in.

## 5) Create your account

1. Open the Worker URL printed at the end of the deploy.
2. Create the administrator's account. Do this right after the deploy finishes: registration closes once the first account exists, and until then anyone who finds the URL could claim the installation.
3. OpenSEO loads with a default project. Add your website to get started.

If something fails, see Troubleshooting below.

## Giving teammates access

Invite them from Team settings. The app copies an invitation link; the invited address creates its own account from that link and joins your workspace. There is no email delivery, so send the link yourself. Everyone works in one shared workspace and sees the same projects.

## Connecting MCP clients

MCP clients connect to `https://YOUR_WORKER_HOSTNAME/mcp` and sign in with your OpenSEO account, the same way they connect to the hosted service. Follow the [MCP setup guide](https://openseo.so/docs/mcp) with your Worker URL in place of the hosted one.

## Use your own domain

To serve OpenSEO on your own hostname, set `CUSTOM_DOMAIN=seo.example.com` in `.env.selfhost` and deploy. The domain must be a zone on the same Cloudflare account; the deploy attaches it to the Worker and creates the DNS record and certificate. Don't add the domain in the Cloudflare dashboard instead: each deploy removes custom domains that `CUSTOM_DOMAIN` doesn't name.

It works with both sign-in options:

- **Password accounts:** sign-in and MCP clients then work only on that address, so set it before creating accounts if you can. Changing it later signs everyone out, and MCP clients reconnect at the new URL.
- **Cloudflare Access:** the deploy adds the domain to the Access application it created, so the same email list protects both the custom domain and the `workers.dev` address. If you manage the Access application yourself (`TEAM_DOMAIN` and `POLICY_AUD`), add the hostname to it by hand as another public hostname.

## Forgot a password?

There is no email delivery, so an operator resets passwords from a terminal. See [Manage accounts](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md#manage-accounts).

## Updating to the latest OpenSEO version

```bash
git pull        # or: git fetch upstream && git merge upstream/main, if you forked
pnpm install
pnpm deploy:selfhost --yes
```

## Cloudflare Access: the most secure option

With `AUTH_MODE=cloudflare_access`, Cloudflare's own login protects the Worker: every request is checked at Cloudflare's edge before it reaches OpenSEO, and only the emails you list get through. It needs an extra login scope, a Zero Trust team (usually created for you), and Zero Trust settings before MCP clients can connect, so expect more setup. Choose the sign-in mode before your first deploy; the two keep separate user records.

1. In `.env.selfhost`, set `AUTH_MODE=cloudflare_access`, `SELFHOST_ADMIN_EMAILS` to the comma-separated administrator emails, and `ACCESS_ALLOWED_EMAILS` to the comma-separated list of people allowed to sign in. Include every administrator in `ACCESS_ALLOWED_EMAILS` when Alchemy manages the Access application. Existing deployments can still use `SELFHOST_ADMIN_EMAIL` when the list is omitted.
2. Add the `access:write` scope to your Cloudflare login: run `pnpm alchemy login deploy/alchemy/alchemy.run.ts --configure`, answer yes to "Customize OAuth scopes?", and select `access:write` alongside the defaults.
3. Run `pnpm deploy:selfhost --yes`. The deploy creates the Cloudflare Access application protecting the Worker (allowing exactly `ACCESS_ALLOWED_EMAILS`). If the account has no Zero Trust team yet, one is created for you, named after your workers.dev subdomain. If Zero Trust has never been turned on for the account, the deploy stops instead: open [one.dash.cloudflare.com](https://one.dash.cloudflare.com), pick the Free plan (Cloudflare creates the team), and run the deploy again.

Open the printed URL and sign in with Cloudflare Access. Verified emails in `SELFHOST_ADMIN_EMAILS` receive administrator access. Other Access users join as members. Removing an email from the list takes effect on that account's next request. Access can take about 2 minutes to apply after the first deploy. OpenSEO rejects requests without an Access token. To add teammates, add them to `ACCESS_ALLOWED_EMAILS` and redeploy. Dashboard edits to that Access policy are overwritten on the next deploy. To manage the Access application yourself, set `TEAM_DOMAIN` (`https://your-team.cloudflareaccess.com`) and `POLICY_AUD` (the application's audience tag). Ensure your Access policy admits each administrator. MCP clients need Managed OAuth turned on for the Access application. See [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md#through-cloudflare-access).

Deployments created before password accounts existed have no `AUTH_MODE` in `.env.selfhost`, which still means Cloudflare Access. Configure administrator emails before upgrading. Deployments upgraded from older versions (which gave each user a separate workspace) show administrators a one-time dashboard banner for migrating previous per-user work into the shared workspace. See [project permissions](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md#assign-project-access) for how to grant access after the upgrade.

## Workers Free plan limits

A Cloudflare Workflow on the Workers Free plan can make 50 outgoing requests per run. Each site audit runs as one Workflow, so an audit stops loading pages after about 40 of them. AI visibility setup and checks can fail the same way, with "Too many subrequests". On Workers Paid, `pnpm deploy:selfhost` raises the limit to 1,000,000 requests per run; on Free, the deploy says so and keeps Cloudflare's default. See [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/). For full audits and AI visibility, use Workers Paid or [Docker](./SELF_HOSTING_DOCKER.md).

## Site audits

**Shopify crawler access:** saving the crawler-access signature a Shopify store creates needs `CRAWLER_ACCESS_SECRET` in `.env.selfhost`, set to at least 32 random characters (e.g. `openssl rand -hex 32`), then `pnpm deploy:selfhost --yes`. Keep the value once set: changing it makes saved signatures unreadable.

## Troubleshooting

- `https://<your-worker-hostname>/api/health` reports runtime configuration checks and database status.
- Cloudflare Access login fails: re-check `ACCESS_ALLOWED_EMAILS` in `.env.selfhost` and redeploy.
- For server errors, open the Worker `Logs` or run `pnpm exec wrangler tail`. Site audits run in a separate worker: `pnpm exec wrangler tail open-seo-selfhost-audit`.

## Tearing it down

```bash
pnpm alchemy destroy deploy/alchemy/alchemy.run.ts --env-file .env.selfhost --stage selfhost
```

This deletes the Workers, the stage-suffixed D1/KV/R2 resources (including your data), and the Access application if the deploy created one.

## Next steps

See [Operations](./SELF_HOSTING_CLOUDFLARE_OPERATIONS.md) for managing accounts, connecting MCP clients, and telemetry.
