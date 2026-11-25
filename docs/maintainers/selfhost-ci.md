# Cloudflare self-host deployment from GitHub Actions

The `deploy-selfhost` job in [CI](../../.github/workflows/ci.yml) publishes `open-seo-selfhost` at `https://openseo.ighenatt.es`. It deploys on pushes to `main` in `elugon/open-seo` after the app and website checks and both container builds pass. A manual run of CI from `main` generates the Alchemy plan. Both actions use the latest commit on `main`.

## Configure and enable

1. Protect `main` with required pull requests and the `ci`, `docker-build`, and `standalone-image` checks. Require maintainer review for `.github/` changes. Configure the `selfhost-production` GitHub environment to allow deployments from `main` only.
2. In that environment, add the `CLOUDFLARE_ACCOUNT_ID` variable for the existing deployment and the `CLOUDFLARE_API_TOKEN` secret. Use an account-scoped deployment token. See the [Alchemy token permissions](production-deployment.md#secrets) for the shared requirements and include Access write permission if Alchemy manages the Access application.
3. Store the deployment configuration in the `SELFHOST_ENV` environment secret. Keep `AUTH_MODE=cloudflare_access`, `CUSTOM_DOMAIN=openseo.ighenatt.es`, and the provider and integration settings there. Set the separate `SELFHOST_ADMIN_EMAILS` secret in `selfhost-production` to a comma-separated list. Verify the Access policy admits every address. This secret can be added to an existing installation while preserving its `SELFHOST_ENV` value. A legacy `SELFHOST_ADMIN_EMAIL` in `SELFHOST_ENV` still works when the list is omitted.
4. Back up the live D1 database. Under **Actions → CI**, select **Run workflow** on `main`. CI builds the Worker and runs `alchemy plan` using the production configuration. The account-limit check briefly uploads and removes a temporary Worker. Confirm that the plan retains the existing database, Access application, and custom domain. Resolve any unexpected replacement before deploying.
5. Set the repository Actions variable `ENABLE_SELFHOST_DEPLOY` to `true`. The next push to `main` can deploy once CI passes. To deploy the current tip after planning, rerun its push CI run. Check the workflow result, then sign in at `https://openseo.ighenatt.es` to verify the live app with an authorized account.

## Stop or roll back

Set `ENABLE_SELFHOST_DEPLOY` to `false` to stop scheduling new automatic deploys. Let an active migration finish. Review the Cloudflare deployment and the Alchemy state before retrying. A [Worker rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) changes the Worker version but leaves D1 migrations and data in place. Check schema compatibility before reverting code.

Before upgrading an existing deployment to the version with project permissions, configure the administrator emails, back up D1, and check the Alchemy plan as above. After deployment, sign in as an administrator and grant the planned assignments under **Settings → Users and permissions**. Verify an assigned and an unassigned project with a regular Access account.

Before rolling back to a Worker version without project permissions, restrict the Cloudflare Access policy to the administrator. Earlier Worker versions give every admitted user access to the shared workspace. Keep the additive permissions table and its assignments in D1 so they are available when the new version is restored.
