# Two-year simulated history and database-backed insights

The import is **illustrative training data, not verified company history**. It adds the previous 24 complete months: four customer orders per month and one supplier purchase per year. Catalog prices, quantities, delivery performance and locations are estimates, not extracted from supplied invoices. Every generated order, payment, stock transaction and audit event carries `[SIMULATED:HISTORY-V1]`. Catalog/customer/project/supplier names are visibly prefixed `[SIMULATED]`.

Existing records and accounts are never updated or deleted. Nine separate simulation SKUs protect real inventory quantities. The generated stock ledger starts at zero, purchases cover the year, issues match order quantities and the final balance is zero. Trips do not overlap and all are completed, so the current truck is not occupied. Historical role actions are labelled simulated and are not attributed to real users. Proof attachments are clearly labelled plain-text simulation documents; no bank evidence, signatures or GPS readings are fabricated.

## Running manually

From `backend`, `node scripts/importHistory.js` is a dry run. `node scripts/importHistory.js --apply` makes another verified backup before importing in a single serializable transaction. It refuses a duplicate import. It is not included in startup, deployment or normal seed commands.

For private access, set `IMPEX_DATABASE_URL_FILE` to the path of a mode-600 file containing the public PostgreSQL URL. Otherwise scripts use `backend/.env`. Never commit or share the URL.

`node scripts/verifyHistory.js /absolute/path/to/pre-import-backup` checks backup hashes, preservation of all original rows, unchanged accounts, order/payment/delivery reconciliation, stock running balances, all 24 months and the actual read-only insights handler. Verification reads only.

## Backup and recovery

`.local-backups/<timestamp>-before-history/` is ignored by Git and contains gzip NDJSON snapshots of every public table, row counts, SHA-256 hashes, column metadata, sequence positions and a Prisma schema copy. It includes personal/account data and uploaded-file bytes: keep it private. It is a consistent **data backup**, not a complete PostgreSQL schema/DDL dump. Recovery requires a compatible schema; do not run a whole-database restore against a live database with newer activity. The import manifest records the added IDs for a reviewed, selective rollback. Copy the private backup to secure storage outside this checkout for disaster recovery.

## Insights

The backend owns numeric calculations. Monthly usage is negative `ISSUE` stock changes only; adjustments and purchases are not consumption. Nine packaged Thortex products are matched by explicit names/aliases without treating an unrelated roll as a 16-litre pail. Filters cover date range, product and existing/simulated/all history; older seed/test records are still part of “existing”, which does not certify them as genuine company records. Current inventory follows product/source filters but is not reconstructed for historical dates.

On-time performance requires actual ETA and receipt timestamps; missing dates show insufficient data rather than 100%. Expiry is unknown without batch expiry dates. Reorder cost uses catalog prices and is not a verified supplier quote or claimed saving. An LLM may provide advisory text but cannot replace numerical widgets. These historical observations are not validated forecasts.

Deploy both frontend and backend changes together. No database migration is needed. The import writes the main database immediately, independently of code deployment.
