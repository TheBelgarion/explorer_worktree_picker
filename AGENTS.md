# AGENTS

This repository builds **Explorer Worktree Picker** only.

## Scope guardrails

- Keep UI in the status bar only: one worktree picker item and one refresh item.
- Do not add activity-bar buttons, explorer view contributions, palette command registrations, or any worktree lifecycle features (create, delete, rename, prune).
- Do not introduce a setting that opens new windows for worktree switching.
- Keep status-bar switching same-window and no extension reload.

## Validation commands

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run package`

## Operational constraints

- Picker is available only for a single-folder Git working tree.
- If workspace folders are 0 or >1, hide the status items.
- Keep command IDs internal (status bar click commands should not be added to package.json `contributes.commands`).
