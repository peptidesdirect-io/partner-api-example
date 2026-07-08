# Security Policy

## Supported versions

This is an example repository, not a running service. Only the latest
version on `main` is supported.

## API keys

Your `pk_live_...` Partner API key authenticates every request to the real
PeptidesDirect Partner API and is shown only once when issued.

- Never commit a real API key to source control, in code, tests, fixtures,
  or CI configuration.
- Always load it from an environment variable (for example `PARTNER_API_KEY`)
  and keep it out of shell history and logs.
- If a key is ever exposed (committed, logged, pasted, leaked), treat it as
  compromised: contact PeptidesDirect to have it revoked and reissued.

## Reporting a vulnerability

If you find a security issue in this example client, or believe a
`pk_live_...` key has been exposed, please report it privately rather than
opening a public issue:

- Email: security@peptidesdirect.io or support@peptidesdirect.io

Please include a description of the issue, steps to reproduce, and its
potential impact. We will acknowledge your report and follow up once the
issue has been assessed.
