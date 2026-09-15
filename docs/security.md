# Security guidance

## Credentials and tokens

- This repository contains no tenant-specific values, credentials, tokens, client secrets,
  or certificates.
- The first release uses a Microsoft Entra public-client application and delegated
  device-code sign-in.
- Tokens are held in MSAL's process-local cache only. Persistent token caching is not enabled.
- Never redirect stdout from the MCP process to diagnostic logs; stdout is the MCP protocol
  stream. Authentication and service diagnostics use stderr and must not include tokens.

## Least privilege

The local delegated implementation requests `Files.Read.All`, `Sites.ReadWrite.All`, and
`User.Read`. The signed-in user's SharePoint authorization remains effective, but these
scopes are broader than the two configured locations. Mitigations include:

- use a dedicated Entra app registration;
- restrict who can consent to and use it;
- use a dedicated user account with access only to the intended source and destination;
- enforce Conditional Access and sign-in monitoring;
- audit Graph and SharePoint activity; and
- periodically review consent and revoke the application when no longer needed.

`Sites.Selected` and the newer selected-resource permissions require explicit resource
grants and commonly use application permissions. They should be preferred for an
unattended deployment when feasible, but must not be represented as equivalent to this
interactive delegated profile. A cloud/app-only profile needs separate threat modeling,
credential handling (prefer workload identity or certificates over client secrets), and
tests.

## Data handling

- Source binaries are downloaded only for in-process extraction and are not copied to the
  destination.
- Extracted content is not persisted by the service.
- Evidence excerpts are disabled by default. When enabled, only bounded excerpts are stored.
- Derived details can still contain sensitive information. Apply destination retention,
  sensitivity labels, DLP, access reviews, and audit controls appropriate to the source.
- Synthetic fixtures only are committed.

## Write controls

- Schema and record changes each require a non-mutating preview.
- Approval is bound to the plan digest, destination site ID, expiration, and account ID.
- Apply rejects stale, missing, cross-account, cross-destination, or wrong-kind approvals.
- Each approval is consumed on first apply, and creates recheck indexed unique keys before
  writing.
- No source or destination delete capability exists.
- Source items missing on a later scan are marked unavailable for review.
- Duplicate stable keys fail closed.

## Threats and mitigations

| Threat                         | Mitigation                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Prompt injection in a document | Extracted text is treated as evidence, not executable instructions; only narrow MCP tools exist |
| Secret leakage                 | No secrets in git; no token logging; process-local MSAL cache                                   |
| Accidental broad writes        | Fixed destination URL, four list manifests, preview/approval/apply state machine                |
| Concurrent overwrite           | ETag-based updates; Graph precondition failures are reported                                    |
| Partial Graph failure          | Per-item outcomes and partial status; safe rerun through idempotent keys                        |
| Source disappearance           | Non-destructive unavailable/review update                                                       |
| Oversized/parser bomb          | Configured byte limit and parser failures surfaced as review items                              |

## Official references

- [Microsoft identity platform authentication flows](https://learn.microsoft.com/entra/identity-platform/msal-authentication-flows)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/graph/permissions-reference)
- [Selected permissions overview](https://learn.microsoft.com/graph/permissions-selected-overview)
- [Microsoft Graph throttling guidance](https://learn.microsoft.com/graph/throttling)
- [GitHub custom agents configuration](https://docs.github.com/copilot/reference/custom-agents-configuration)
- [GitHub Copilot CLI MCP configuration](https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
