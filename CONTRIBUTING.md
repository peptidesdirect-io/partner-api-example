# Contributing

This repository mirrors the real PeptidesDirect Partner / Reseller Order
API. Pull requests that keep the client and example in sync with the live
API, fix bugs, or improve documentation are welcome.

## Setup

```bash
npm install
```

## Typecheck and build

```bash
npm run typecheck
npm run build
```

Both must pass before opening a pull request. CI runs the same checks on
every push and pull request.

## Running the example

The example calls the real API, so it needs a partner API key:

```bash
PARTNER_API_KEY=pk_live_xxx npm run example
```

Never commit a real API key. Set it via an environment variable only, and
never paste one into an issue, pull request, commit message, or test
fixture. See [SECURITY.md](SECURITY.md) for what to do if a key is ever
exposed.

## Pull requests

- Keep changes focused and small; one topic per pull request.
- Match the existing code style (TypeScript strict, ESM, no runtime
  dependencies).
- Update the README if you change the client's public API or behavior.
- Describe what you changed and why in the pull request description.
