import { execFile } from 'node:child_process';
import util from 'node:util';
import {
  Disposable,
  ExtensionContext,
  QuickPickItem,
  StatusBarAlignment,
  ThemeColor,
  Uri,
  commands,
  window,
  workspace
} from 'vscode';
import {
  OrderedWorktreeResult,
  WorktreeDescriptor,
  buildMenuEntries,
  getDisplayLabel,
  normalizePathForCompare,
  parsePorcelainWorktreeList
} from './model/worktree';

const CMD_OPEN_PICKER = 'explorerWorktreePicker.openPicker';
const CMD_REFRESH = 'explorerWorktreePicker.refresh';
const RECENT_KEY = 'explorerWorktreePicker.recentWorktrees';
const MAX_RECENT_ENTRIES = 5;
const WORKTREE_ICON = '$(multiple-windows)';

const execFileAsync = util.promisify(execFile);

interface CandidateItem extends QuickPickItem {
  worktreePath: string;
}

interface SingleWorkspaceFolder {
  uri: Uri;
  name: string;
}

export function activate(context: ExtensionContext): void {
  const state = new WorktreePickerState(context);
  context.subscriptions.push(state);
}

export function deactivate(): void {
  // no-op
}

class WorktreePickerState implements Disposable {
  private pickerStatus = window.createStatusBarItem(StatusBarAlignment.Left, 100);
  private refreshStatus = window.createStatusBarItem(StatusBarAlignment.Left, 99);
  private activeWorktreePath: string | undefined;
  private entries: OrderedWorktreeResult | undefined;
  private busy = false;
  private disposed = false;
  private readonly recentHistory: string[] = [];
  private readonly workspaceNamesByPath = new Map<string, string>();

  constructor(private readonly context: ExtensionContext) {
    this.pickerStatus.name = 'Worktree Picker';
    this.pickerStatus.command = CMD_OPEN_PICKER;
    this.pickerStatus.tooltip = 'pick worktree';

    this.refreshStatus.name = 'Refresh Worktree Picker';
    this.refreshStatus.command = CMD_REFRESH;
    this.refreshStatus.text = '$(refresh)';
    this.refreshStatus.tooltip = 'Refresh worktree list';

    this.recentHistory.push(...context.globalState.get<string[]>(RECENT_KEY, []));

    context.subscriptions.push(
      this.pickerStatus,
      this.refreshStatus,
      workspace.onDidChangeWorkspaceFolders(() => {
        void this.refreshWorktrees();
      }),
      commands.registerCommand(CMD_OPEN_PICKER, () => {
        void this.openPicker();
      }),
      commands.registerCommand(CMD_REFRESH, () => {
        void this.refreshWorktrees();
      })
    );

    void this.refreshWorktrees();
  }

  dispose(): void {
    this.disposed = true;
    this.pickerStatus.dispose();
    this.refreshStatus.dispose();
  }

  private get activeWorkspaceFolder(): SingleWorkspaceFolder | undefined {
    const folders = workspace.workspaceFolders;
    if (!folders || folders.length !== 1) {
      return undefined;
    }

    return {
      uri: folders[0].uri,
      name: folders[0].name
    };
  }

  private async openPicker(): Promise<void> {
    if (this.busy) {
      return;
    }

    if (!this.entries) {
      await this.refreshWorktrees();
    }

    if (!this.entries || !this.activeWorktreePath || !this.activeWorkspaceFolder) {
      window.showWarningMessage('Worktree picker is unavailable in this workspace.');
      return;
    }

    const all = [this.entries.main, ...this.entries.entries];
    const items = all.map((entry) => {
      const isMain = this.normalize(entry.path) === this.normalize(this.entries?.main.path ?? '');
      const label = isMain ? 'Main' : getDisplayLabel(entry).label;
      const isCurrent = this.normalize(entry.path) === this.normalize(this.activeWorktreePath ?? '');
      return {
        label,
        detail: entry.path,
        picked: isCurrent,
        description: isCurrent ? 'Current worktree' : undefined,
        worktreePath: entry.path
      } satisfies CandidateItem;
    });

    const selected = await window.showQuickPick(items, {
      canPickMany: false,
      ignoreFocusOut: true,
      title: 'Switch Explorer Worktree'
    });

    if (!selected) {
      return;
    }

    if (this.normalize(selected.worktreePath) === this.normalize(this.activeWorktreePath)) {
      return;
    }

    await this.switchWorktree(selected.worktreePath);
  }

  private async refreshWorktrees(): Promise<void> {
    if (this.busy || this.disposed) {
      return;
    }

    const folder = this.activeWorkspaceFolder;
    if (!folder) {
      this.hideControls();
      this.entries = undefined;
      this.activeWorktreePath = undefined;
      return;
    }

    await this.withBusy('Refreshing worktrees', async () => {
      const folderPath = this.uriToPath(folder.uri);
      if (!folderPath) {
        this.hideControls();
        this.entries = undefined;
        this.activeWorktreePath = undefined;
        return;
      }

      const repoRoot = await this.getRepoRoot(folderPath);
      if (!repoRoot) {
        this.hideControls();
        this.entries = undefined;
        this.activeWorktreePath = undefined;
        return;
      }

      const listOutput = await this.execGit(repoRoot, ['worktree', 'list', '--porcelain']);
      const parsed = parsePorcelainWorktreeList(listOutput);
      let ordered: OrderedWorktreeResult;
      try {
        ordered = buildMenuEntries(parsed, this.recentHistory, MAX_RECENT_ENTRIES);
      } catch {
        this.hideControls();
        this.entries = undefined;
        this.activeWorktreePath = undefined;
        return;
      }
      if (ordered.entries.length === 0) {
        this.hideControls();
        this.entries = undefined;
        this.activeWorktreePath = undefined;
        return;
      }

      this.entries = ordered;

      const activePath = this.uriToPath(folder.uri);
      if (!activePath) {
        this.hideControls();
        this.entries = undefined;
        this.activeWorktreePath = undefined;
        return;
      }

      const knownPaths = [ordered.main.path, ...ordered.entries.map((entry) => entry.path)];
      const activeNormalized = this.normalize(activePath);
      const matching = knownPaths.find((entryPath) => this.normalize(entryPath) === activeNormalized);

      if (!matching) {
        this.hideControls();
        this.entries = undefined;
        this.activeWorktreePath = undefined;
        return;
      }

      const workspaceFolder = this.activeWorkspaceFolder;
      if (!workspaceFolder) {
        this.hideControls();
        this.entries = undefined;
        this.activeWorktreePath = undefined;
        return;
      }

      this.activeWorktreePath = matching;
      this.rememberWorkspaceName(activePath, workspaceFolder.name);
      this.renderStatusBar();

      await this.context.globalState.update(RECENT_KEY, ordered.recent);
      this.recentHistory.splice(0, this.recentHistory.length, ...ordered.recent);
    });
  }

  private async switchWorktree(targetPath: string): Promise<void> {
    if (this.busy || this.disposed) {
      return;
    }

    if (!this.activeWorkspaceFolder) {
      return;
    }

    const normalizedTarget = this.normalize(targetPath);
    if (normalizedTarget === this.normalize(this.activeWorktreePath ?? '')) {
      return;
    }

    const currentFolder = this.activeWorkspaceFolder;
    if (!currentFolder) {
      return;
    }

    await this.withBusy('Switching worktree', async () => {
      const currentFolderUri = currentFolder.uri;
      const targetUri = this.makeCompatibleUri(currentFolderUri, targetPath);
      const targetName = this.getWorkspaceName(targetPath);
      const replaceOptions = targetName
        ? { uri: targetUri, name: targetName }
        : { uri: targetUri };

      const ok = workspace.updateWorkspaceFolders(0, 1, replaceOptions);
      if (!ok) {
        window.showErrorMessage(`Could not switch explorer to ${targetPath}`);
        return;
      }

      await this.waitForWorkspaceFolderChange(targetPath);
      try {
        await commands.executeCommand('workbench.view.explorer');
        await commands.executeCommand('workbench.files.action.collapseExplorerFolders');
      } catch {
        // best-effort focus/collapse in cases where command is unavailable.
      }

      const switched = this.normalize(this.uriToPath(workspace.workspaceFolders?.[0]?.uri ?? folderUriPlaceholder()));
      if (switched !== this.normalize(targetPath)) {
        window.showErrorMessage(`Could not switch explorer to ${targetPath}`);
        return;
      }

      await this.recordRecentSelection(targetPath);
      await this.refreshWorktrees();
    });
  }

  private async recordRecentSelection(targetPath: string): Promise<void> {
    if (!this.entries) {
      return;
    }

    if (this.normalize(targetPath) === this.normalize(this.entries.main.path)) {
      return;
    }

    const next = this.recentHistory.filter((entry) => entry !== this.normalize(targetPath));
    next.unshift(this.normalize(targetPath));
    while (next.length > MAX_RECENT_ENTRIES) {
      next.pop();
    }

    this.recentHistory.splice(0, this.recentHistory.length, ...next);
    await this.context.globalState.update(RECENT_KEY, next);
  }

  private resolveEntryByPath(targetPath: string): WorktreeDescriptor | undefined {
    const normalized = this.normalize(targetPath);
    if (!this.entries) {
      return undefined;
    }

    if (this.normalize(this.entries.main.path) === normalized) {
      return this.entries.main;
    }

    return this.entries.entries.find((entry) => this.normalize(entry.path) === normalized);
  }

  private getRepoRoot(start: string): Promise<string | undefined> {
    return this.execGit(start, ['rev-parse', '--show-toplevel'])
      .then((result) => result.trim())
      .catch(() => undefined);
  }

  private async waitForWorkspaceFolderChange(targetPath: string): Promise<void> {
    const expected = this.normalize(targetPath);
    const current = this.normalize(this.uriToPath(workspace.workspaceFolders?.[0]?.uri ?? folderUriPlaceholder()));
    if (current === expected) {
      return;
    }

    await new Promise<void>((resolve) => {
      let resolved = false;

      const resolveDone = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        subscription.dispose();
        clearTimeout(timer);
        resolve();
      };

      const timer = setTimeout(resolveDone, 1500);
      const subscription = workspace.onDidChangeWorkspaceFolders(() => {
        const nextPath = this.normalize(this.uriToPath(workspace.workspaceFolders?.[0]?.uri ?? folderUriPlaceholder()));
        if (nextPath === expected) {
          resolveDone();
        }
      });

      const nextPath = this.normalize(this.uriToPath(workspace.workspaceFolders?.[0]?.uri ?? folderUriPlaceholder()));
      if (nextPath === expected) {
        resolveDone();
      }
    });
  }

  private async withBusy(message: string, action: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.pickerStatus.text = `$(sync~spin) ${message}`;
    this.refreshStatus.text = '$(sync~spin)';
    this.pickerStatus.show();
    this.refreshStatus.show();

    try {
      await action();
    } finally {
      this.busy = false;
      this.renderStatusBar();
    }
  }

  private async execGit(cwd: string, args: string[]): Promise<string> {
    const result = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    });
    return String(result.stdout).trimEnd();
  }

  private hideControls(): void {
    this.pickerStatus.hide();
    this.refreshStatus.hide();
  }

  private renderStatusBar(): void {
    if (!this.entries || !this.activeWorktreePath) {
      this.hideControls();
      return;
    }

    const entry = this.resolveEntryByPath(this.activeWorktreePath);
    const isCurrentMain = this.normalize(this.entries.main.path) === this.normalize(this.activeWorktreePath);
    const display = isCurrentMain ? 'Main' : entry ? getDisplayLabel(entry).label : 'Main';
    this.pickerStatus.text = `${WORKTREE_ICON} ${display}`;
    this.pickerStatus.color = isCurrentMain ? undefined : new ThemeColor('statusBarItem.warningForeground');
    this.refreshStatus.text = '$(refresh)';

    this.pickerStatus.show();
    this.refreshStatus.show();
  }

  private uriToPath(uri: Uri): string {
    if (uri.scheme === 'file') {
      return uri.fsPath;
    }

    return decodeURIComponent(uri.path || '');
  }

  private makeCompatibleUri(baseUri: Uri, targetPath: string): Uri {
    if (baseUri.scheme === 'file') {
      return Uri.file(targetPath);
    }

    const normalizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    return Uri.from({
      scheme: baseUri.scheme,
      authority: baseUri.authority,
      path: normalizedPath
    });
  }

  private normalize(value: string): string {
    if (!value) {
      return '';
    }

    return normalizePathForCompare(value);
  }

  private rememberWorkspaceName(path: string, name: string): void {
    const normalized = this.normalize(path);
    if (!normalized || !name) {
      return;
    }

    if (!this.workspaceNamesByPath.has(normalized)) {
      this.workspaceNamesByPath.set(normalized, name);
    }
  }

  private getWorkspaceName(path: string): string | undefined {
    return this.workspaceNamesByPath.get(this.normalize(path));
  }
}

function folderUriPlaceholder(): Uri {
  return Uri.parse('file:///');
}
