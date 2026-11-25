# Cloudflare self-host deployment from GitHub Actions

The `deploy-selfhost` job in [CI](../../.github/workflows/ci.yml) publishes `open-seo-selfhost` at `https://openseo.ighenatt.es`. It runs on pushes to `main` in `elugon/open-seo` after the app and website checks and both container builds pass. It uses the same commit as those checks and skips a rerun if that commit is no longer at the tip of `main`.

## Configure and enable

1. Protect `main` with required pull requests and the `ci`, `docker-build`, and `standalone-image` checks. Require maintainer review for `.github/` changes. Configure the `selfhost-production` GitHub environment to allow deployments from `main` only.
2. In that environment, add the `CLOUDFLARE_ACCOUNT_ID` variable for the existing deployment and the `CLOUDFLARE_API_TOKEN` secret. Use an account-scoped deployment token. See the [Alchemy token permissions](production-deployment.md#secrets) for the shared requirements and include Access write permission if Alchemy manages the Access application.
3. Add the current `.env.selfhost` contents as the `SELFHOST_ENV` environment secret. Preserve the existing provider keys, Access allowlist or `TEAM_DOMAIN` and `POLICY_AUD`, and any configured integration or encryption secrets. Set `AUTH_MODE=cloudflare_access` and `CUSTOM_DOMAIN=openseo.ighenatt.es` explicitly. The Cloudflare account ID and API token are configured separately.
4. Before enabling the first deployment, back up the live D1 database. Check the Alchemy plan against the current stack and confirm it retains the existing database, Access application, and custom domain. Build as documented in the [Cloudflare self-host guide](../../web/content/docs/self-hosting/cloudflare.md), then use `pnpm alchemy plan deploy/alchemy/alchemy.run.ts --env-file .env.selfhost --stage selfhost` with the target account credentials. Resolve any unexpected resource replacement before continuing.
5. Set the repository Actions variable `ENABLE_SELFHOST_DEPLOY` to `true`. The next push to `main` can deploy once CI passes. Check the workflow result, then sign in at `https://openseo.ighenatt.es` to verify the live app with an authorized account.

## Stop or roll back

Set `ENABLE_SELFHOST_DEPLOY` to `false` to stop scheduling new automatic deploys. Let an active migration finish. Review the Cloudflare deployment and the Alchemy state before retrying. A [Worker rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) changes the Worker version but leaves D1 migrations and data in place. Check schema compatibility before reverting code.
