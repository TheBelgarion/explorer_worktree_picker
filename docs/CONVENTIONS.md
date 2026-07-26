# Conventions

## TypeScript

- Strict TypeScript enabled.
- Keep modules small and purpose-driven.
- No `any` usage unless strictly necessary; prefer explicit interfaces.

## Layering

- `src/model/` contains Git-parsing and ordering logic with no VS Code API dependencies.
- `src/extension.ts` contains VS Code-specific wiring (status bar, commands, workspace updates).

## Dependency policy

- Runtime code ships without third-party dependencies.
- `vscode`, `node` built-ins, and dev tooling are used only for build/test tooling.

## Testing expectations

- Unit tests focus on pure model logic:
  - porcelain parsing (normal, detached, bare, spaced path, CRLF)
  - main detection
  - recent-order behavior
  - stale history pruning
  - fallback order from Git list
- Integration validation is manual:
  - same-window behavior
  - no activity-bar entries
  - no new window prompt
  - folder refresh and focus behavior
