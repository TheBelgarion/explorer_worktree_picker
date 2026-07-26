# Explorer Worktree Picker — Specification

## UX

- No activity bar icon and no explorer view contribution.
- Bottom-left status bar shows:
  - Worktree picker control: `$(multiple-windows) <current label>`
  - Refresh control: `$(refresh)`
- Clicking the picker opens a quick pick containing:
  - `Main`
  - Up to 5 linked worktrees
- Current worktree is pre-selected/highlighted in the quick pick.

## Worktree discovery

- Discovery uses:
  - `git rev-parse --show-toplevel` to ensure the active folder is a Git worktree.
  - `git worktree list --porcelain` for all worktree metadata.
- Ignore bare entries.
- The first non-bare worktree is treated as `Main`.
- Branch and detached worktrees use Git porcelain metadata.

## Order and display rules

- Picker order:
  1. Main
  2. At most 5 linked worktrees in persisted recent-selection order.
  3. Fill remaining slots by Git porcelain order.
- Missing/invalid recent paths are dropped.
- Labels:
  - Main: `Main`
  - Linked branch worktree: branch name
  - Detached: `Detached <sha7>`
- Paths are shown as secondary text (detail) in the quick pick.

## Switching behavior

- Switching is performed with:
  - `vscode.workspace.updateWorkspaceFolders(0, 1, { uri })`
- No restart/reload is triggered.
- No invocation of `openFolder` and no `openInNewWindow` behavior.
- After successful update:
  - wait for `onDidChangeWorkspaceFolders`
  - focus Explorer
  - collapse explorer folders

## Errors and empty states

- If the workspace is not a single Git worktree:
  - status bar controls are hidden.
- If switching returns failure:
  - do not change current root
  - show an error message.

## Success criteria

- Status bar controls appear on eligible single-worktree folders.
- Refresh button updates worktree list and includes externally-added worktrees.
- Selecting an entry switches Explorer root in the same window with source control context updated.
*** End Patch
