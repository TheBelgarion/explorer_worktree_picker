import path from 'node:path';

export type WorktreeKind = 'branch' | 'detached';

export interface WorktreeDescriptor {
  path: string;
  head: string;
  branch?: string;
  detached: boolean;
  isBare: boolean;
}

export interface OrderedWorktreeResult {
  main: WorktreeDescriptor;
  entries: WorktreeDescriptor[];
  recent: string[];
}

const WORKTREE_PREFIX = 'worktree ';
const HEAD_PREFIX = 'HEAD ';
const BRANCH_PREFIX = 'branch ';
const GIT_REF_PREFIX = 'refs/heads/';

function normalizePath(value: string): string {
  if (!value) {
    return '';
  }

  const normalized = path
    .normalize(value)
    .replace(/\\+/g, '/')
    .replace(/\/+$/, '');

  return process.platform === 'win32'
    ? normalized.toLowerCase()
    : normalized;
}

export function getDisplayLabel(worktree: WorktreeDescriptor): { label: string; kind: WorktreeKind } {
  if (worktree.detached || !worktree.branch) {
    return {
      kind: 'detached',
      label: `Detached ${worktree.head.slice(0, 7)}`
    };
  }

  return {
    kind: 'branch',
    label: normalizeBranch(worktree.branch)
  };
}

export function getWorkspaceFolderName(worktree: WorktreeDescriptor, isMain: boolean): string {
  return isMain ? 'Main' : getDisplayLabel(worktree).label;
}

export function normalizeBranch(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.startsWith(GIT_REF_PREFIX)) {
    return trimmed.slice(GIT_REF_PREFIX.length);
  }
  return trimmed;
}

export function parsePorcelainWorktreeList(input: string): WorktreeDescriptor[] {
  const result: WorktreeDescriptor[] = [];
  const lines = input.split(/\r?\n/);
  let current: WorktreeDescriptor | null = null;

  const flush = () => {
    if (!current) {
      return;
    }

    if (current.path) {
      result.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.length === 0) {
      flush();
      continue;
    }

    if (line.startsWith(WORKTREE_PREFIX)) {
      flush();
      current = {
        path: line.slice(WORKTREE_PREFIX.length),
        head: '',
        detached: false,
        isBare: false
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith(HEAD_PREFIX)) {
      current.head = line.slice(HEAD_PREFIX.length);
    } else if (line.startsWith(BRANCH_PREFIX)) {
      current.branch = line.slice(BRANCH_PREFIX.length);
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line === 'bare') {
      current.isBare = true;
    }
  }

  flush();

  return result;
}

export function buildMenuEntries(
  worktrees: WorktreeDescriptor[],
  recentPaths: string[],
  maxRecent: number
): OrderedWorktreeResult {
  const nonBare = worktrees.filter((entry) => !entry.isBare);

  if (nonBare.length === 0) {
    throw new Error('No non-bare worktrees available');
  }

  const main = nonBare[0];
  const candidates = nonBare.slice(1);

  const normalizedRecent = recentPaths
    .map((value) => normalizePath(value))
    .filter((value, index, array) => array.indexOf(value) === index);

  const candidateByPath = new Map(
    candidates.map((entry) => [normalizePath(entry.path), entry])
  );

  const ordered: WorktreeDescriptor[] = [];
  const seen = new Set<string>();

  for (const candidate of normalizedRecent) {
    const match = candidateByPath.get(candidate);
    if (!match || seen.has(candidate)) {
      continue;
    }
    ordered.push(match);
    seen.add(candidate);
  }

  const fallback = candidates.filter((entry) => !seen.has(normalizePath(entry.path)));
  ordered.push(...fallback);

  const finalEntries = ordered.slice(0, maxRecent);
  const newRecent = Array.from(new Set(finalEntries.map((entry) => normalizePath(entry.path))));

  return {
    main,
    entries: finalEntries,
    recent: newRecent
  };
}

export function normalizePathForCompare(value: string): string {
  return normalizePath(value);
}
