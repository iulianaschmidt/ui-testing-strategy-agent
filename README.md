# UI Testing Strategy Agent

A repository-scoped GitHub Copilot custom agent and local Model Context Protocol (MCP)
service that turns user-authorized SharePoint UI evidence into traceable test strategy
records.

The service:

- reads a configured SharePoint source folder without exposing source mutation tools;
- extracts DOCX, XLSX, PPTX, PDF, text, Markdown, and common source-code files locally;
- distinguishes documented facts from deterministic inference;
- flags conflicts, low-confidence classifications, unsupported files, and partial failures;
- previews idempotent creates/updates in four destination lists;
- requires an exact, digest-bound approval from the same signed-in account before writes;
- never deletes source or destination content; and
- marks previously indexed but now unavailable source items for review.

## Destination lists

| List                       | Purpose                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| **UI Evidence Index**      | Source metadata, extraction state, type, fingerprint, conflicts, and availability |
| **Requirements and Risks** | Explicit requirements and inferred risks with provenance and confidence           |
| **Test Scenario Backlog**  | Requirement-derived scenario intents, expected results, priority, and provenance  |
| **Analysis Runs**          | Traceable analysis metadata and source-level failures                             |

Every derived record stores `SourceLink`, `SourceDriveId`, `SourceItemId`, and
`SourceScopeKey`. `StableKey` is a deterministic SHA-256 key derived from source identity,
record kind, and a stable discriminator. The service fails closed if a destination key is
duplicated.

## Prerequisites

- Node.js 20 or later.
- GitHub Copilot CLI with the repository trusted so `.github/mcp.json` is loaded.
- A Microsoft Entra public-client application configured for device-code sign-in.
- Administrator consent for the delegated Graph permissions listed below, where required.
- A user account that can read the source folder and edit the destination site.

## Required user-provided values

Copy `.env.example` to a local `.env` only if your shell or launcher loads it; this service
does not automatically load dotenv files. Prefer setting these environment variables in
the local process:

| Variable                           | Value                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| `UI_EVIDENCE_TENANT_ID`            | Exact Entra tenant ID or verified tenant domain            |
| `UI_EVIDENCE_CLIENT_ID`            | Exact public-client application ID                         |
| `UI_EVIDENCE_SOURCE_FOLDER_URL`    | Exact HTTPS URL of the authorized SharePoint source folder |
| `UI_EVIDENCE_DESTINATION_SITE_URL` | Exact HTTPS URL of the destination SharePoint site         |

Optional variables:

- `UI_EVIDENCE_MAX_FILE_BYTES` defaults to 20 MiB.
- `UI_EVIDENCE_STORE_EXCERPTS` defaults to `false`.
- `UI_EVIDENCE_PLAN_TTL_MINUTES` defaults to 30.

Do not commit `.env`, tokens, client secrets, certificates, tenant URLs, or real source
content.

## Entra permissions

The local MCP uses device-code authentication through `@azure/msal-node` and requests:

- `User.Read`
- `Files.Read.All`
- `Sites.ReadWrite.All`

These delegated scopes are intentionally explicit, but they can expose more sites than the
configured source and destination. Authorization is still bounded by the signed-in user's
access, while code-level capability boundaries keep the source adapter read-only.

`Sites.Selected` is not advertised as a drop-in replacement for this delegated local flow.
If the tenant requires site-selected access, use an administrator-reviewed application
permission design with explicit site grants; that is a separate deployment profile and is
not implemented here. See [Security](docs/security.md).

## Install and build

```powershell
npm ci
npm run check
npm run build
```

The committed `.github/mcp.json` starts `npm run mcp`, which requires `dist/` to exist.
For development, use `npm run mcp:dev`.

## Provision destination schema

The provisioning command first prints a complete dry-run. It creates only missing lists and
columns and has no delete path:

```powershell
npm run schema:provision
```

Review the JSON diff, then type the exact confirmation phrase when prompted. Existing
columns are not changed automatically; incompatible columns must be reviewed by an
administrator.

## Run with Copilot CLI

1. Build the service and start Copilot CLI from this trusted repository.
2. Select the **UI Testing Strategy** custom agent.
3. Ask it to inspect status and analyze the configured source.
4. Review and approve any schema plan.
5. Review the upsert diff, including conflicts and review items.
6. Explicitly approve the exact plan before apply.

Plans live only in the MCP process, expire by default after 30 minutes, and are bound to the
destination site, digest, and signed-in Entra account. Restarting the MCP invalidates all
plans and approvals. Approved plans are single-use, including when an apply partially fails.

## Development

```powershell
npm test
npm run typecheck
npm run lint
npm run format:check
```

Normal CI is tenant-free and uses synthetic fixtures/fake adapters. Live SharePoint
verification is intentionally opt-in and must use a non-production tenant and dedicated
test sites.

See [Architecture](docs/architecture.md), [Operations](docs/operations.md), and
[Security](docs/security.md).
