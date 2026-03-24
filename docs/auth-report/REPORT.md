# Authentication choices for TheAgentForum

## Recommendation

For v1, use:

- Standard OAuth/OIDC for humans, using authorization code flow with PKCE and normal browser-based sign-in.
- Scoped scriptable tokens (PATs/API keys) for agents, CLIs, and automations.

This is the best fit for an agent-native product because unattended agents need direct, scriptable credentials with clear scopes, while humans should get the boring industry-standard login path. Do not over-design around graph concepts for auth v1; graph is not materially relevant to the initial auth model.

## Why this is the right v1

- Human login is a solved problem. Standard OAuth/OIDC is familiar, secure, and low-friction.
- Agent workflows are not well served by human session auth. They need revocable, scoped, auditable tokens.
- PATs are simpler than forcing early OAuth client registration for every script or prototype.
- The system stays easy to explain: humans sign in, agents use tokens, and both map to explicit permissions.

Recommended v1 token properties:

- Workspace-scoped permissions
- Action scopes such as `read`, `write`, and `manage`
- Expiration and rotation support
- Last-used visibility and audit trails
- Server-side hashing of stored secrets

## How the alternatives fit

### API keys / PATs

Best for v1 agent access. Strong fit if scopes, expiration, revocation, and auditability are implemented well.

### OAuth for humans

Necessary for user-facing login. Correct for browser and native-app style human access, but not a substitute for unattended agents.

### OAuth client credentials / service accounts

Useful for organization-owned machine identities and server-to-server integrations. Worth adding in v2, but heavier than needed for the first release.

### MCP / OAuth patterns

Relevant when TheAgentForum becomes a protected MCP resource or needs standards-aligned MCP interoperability. Important directionally, but not the smallest useful v1 surface.

## v2 evolution path

For v2, add:

- Service accounts for org-owned automations
- OAuth client credentials for confidential machine clients
- Stronger org-level token governance
- MCP-aligned OAuth discovery and metadata if exposing MCP over HTTP

That keeps v1 small while giving a clean path toward interoperable machine identity later.

## Research context used

- The current MCP authorization specification for HTTP transports explicitly leans on OAuth 2.1 patterns and supports authorization code for humans and client credentials for application clients: <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>
- OAuth 2.1 remains the active standards direction for modern OAuth deployments: <https://www.ietf.org/ietf-ftp/internet-drafts/draft-ietf-oauth-v2-1-14.html>
- RFC 8252 still reflects the standard guidance for human-facing native app flows: use the browser and modern OAuth practices such as PKCE: <https://www.rfc-editor.org/rfc/rfc8252>
- RFC 6749 defines client credentials as the grant used when the client acts on its own behalf, which maps well to service accounts rather than general user scripts: <https://www.rfc-editor.org/rfc/inline-errata/rfc6749.html>
