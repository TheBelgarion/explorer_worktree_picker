# Explorer Worktree Picker

Tiny VS Code extension that puts two adjacent actions in the bottom-left status bar:

1. Current worktree label with a `$(multiple-windows)` icon.
2. `$(refresh)` action to refresh the list.

Clicking the first item opens a picker with:

- `Main`
- Up to 5 linked worktrees, ordered by most recently selected first.

Switching updates the current Explorer root in the **same VS Code window** using `updateWorkspaceFolders`.
The target folder receives the same explicit label shown by the picker, and VS Code's built-in Git
integration is realigned to that target after the switch.

Linked worktrees use a muted rose foreground so they remain distinct from `Main` without using a
warning-level background.

## Settings

All extension settings use the unique `explorerWorktreePicker.*` namespace:

- `explorerWorktreePicker.worktreeColor`: linked-worktree and refresh foreground color. Leave empty
  for the theme-aware muted rose default, or enter a VS Code CSS color such as `#D18AA1`.

## Install

1. Install npm dependencies:

```
npm install
```

2. Build the extension:

```
npm run build
```

3. Package:

```
npm run package
```

`npm run package` invokes VSCE via `npx`, so it will download `@vscode/vsce` only when packaging.
If you prefer a local install, you can also use:

```
npm i -g @vscode/vsce
```

Then install the generated `.vsix` in VS Code.

## Development

- Open this repository in VS Code.
- Press `F5` to start the Extension Development Host.
- Status bar items appear only when one valid Git working tree is open.
- Use the picker to switch between `Main` and recent worktrees.

## Behavior guardrails

- No activity-bar or explorer-tree contributions.
- No worktree create/delete/edit/keybind/palette features.
- No new-window switching.

## Versioning and releases

The extension version is managed in `package.json` (and `package-lock.json`) and can be bumped through Make targets:

```bash
make release-patch   # 0.1.0 -> 0.1.1
make release-minor   # 0.1.0 -> 0.2.0
make release-major   # 0.1.0 -> 1.0.0
```

`make release-*` runs:
1. package-lock-safe version bump
2. `make all` (build, test, package)
3. commit + git tag (`vX.Y.Z`)

Push the tag to GitHub and the GitHub Action will publish a release with the generated `.vsix`:

```bash
git push --follow-tags
```
