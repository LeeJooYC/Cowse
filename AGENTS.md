# Cowse source workspace

- Use Bun 1.3.13, Node >=22 and a current Rust toolchain. Do not use npm/yarn/pnpm.
- Desktop: `apps/examples/cowse-app`. Core/runtime dependencies: `sdk/packages`.
- Preserve Cline Core as the runtime; keep Cowse-specific UI and host behavior in the desktop app.
- Install at the repository root with `bun install --frozen-lockfile`, then `bun run build:sdk` before testing or building dependent packages.
- Run `bun run typecheck` and focused tests; use `ALLOW_UNSIGNED_MAC=1 bun run package:mac` for a local build. Do not confuse compilation success with native UI acceptance.
- Keep provider/model IDs, third-party marketplace metadata and raw backend errors unchanged; localize Cowse-owned UI text.
- Never commit credentials, user state, dependencies, model weights or build output. Do not start/stop the user's live app or shared Hub without approval.
- This export intentionally omits other Cline clients/examples and publishing workflows. Consult the root README for supported commands.
