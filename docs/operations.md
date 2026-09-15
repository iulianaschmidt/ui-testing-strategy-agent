# Operations

## First-time setup

1. Register a Microsoft Entra public-client application for the exact tenant.
2. Enable the device-code/public-client flow according to tenant policy.
3. Request administrator approval for the delegated scopes documented in `README.md`.
4. Set the four required environment variables using exact administrator-provided values.
5. Run `npm ci`, `npm run check`, and `npm run build`.
6. Run `npm run schema:provision`; inspect the dry-run and approve only if correct.
7. Start GitHub Copilot CLI from the trusted repository and select the custom agent.

If any tenant ID, client ID, source folder URL, destination site URL, permission, or account
authorization is unknown, stop and obtain it. Do not substitute sample values.

## Normal run

1. `get_status` validates configuration without sign-in.
2. `analyze_source` triggers delegated sign-in, scans the source, and returns a run ID,
   derived records, review counts, and extraction failures.
3. `preview_upsert` uses the run ID to produce an expiring destination diff.
4. A user reviews all creates, updates, unchanged records, review items, and failures.
5. `approve_plan` records the exact digest with the confirmation phrase.
6. `apply_upsert` rechecks expiry, account, destination, and approval before writing.

An MCP restart clears analysis sessions, plans, and approvals. Reanalyze and regenerate the
preview rather than attempting to reconstruct a plan.

## Partial failures and recovery

- Do not rerun `apply_upsert` after a partial result. Approvals are consumed at the start of
  apply, so replay is rejected.
- Preserve the returned per-item outcomes and Graph request IDs.
- Fix authentication, throttling, schema, duplicate-key, or content problems.
- Run analysis and preview again. Stable keys make successful prior creates/updates
  unchanged, and the new diff contains only remaining changes.
- For HTTP 412/precondition failures, inspect the destination edit and generate a new
  preview; never force-overwrite it.

## Source unavailable handling

The preview compares current evidence-index keys with destination items sharing the same
`SourceScopeKey`. A previously indexed item that is absent from the current scan is updated
to `SourceStatus=unavailable` and `ReviewRequired=true`. It is never deleted.

This mechanism assumes the configured source URL continues to resolve to the same folder
drive/item identity. Moving to a different source root intentionally creates a new scope.

## Schema changes

`schemas/sharepoint-lists.schema.json` documents the contract and
`src/domain/list-manifests.ts` is the executable manifest. The provisioning command creates
missing lists and fields only. Renames, type changes, and removals require a separately
reviewed migration; they are intentionally outside this service.

## Troubleshooting

- **Configuration invalid:** correct the exact variable listed by `get_status`.
- **Device code does not complete:** confirm public-client flow, tenant, app ID, consent,
  Conditional Access, and user assignment.
- **Source URL does not resolve to a folder:** use the exact HTTPS SharePoint folder URL and
  confirm the user can open it.
- **Destination list not found:** run the schema preview/provisioning flow.
- **Duplicate StableKey:** remove or reconcile the duplicate manually after audit; the
  service will not choose one.
- **Throttling:** the Graph client honors `Retry-After` and bounded exponential backoff.
- **Unsupported/oversized file:** change policy only after review, then rerun analysis.
