import { describe, expect, it } from 'vitest';
import {
  buildMenuEntries,
  getDisplayLabel,
  getWorkspaceFolderName,
  parsePorcelainWorktreeList
} from '../model/worktree';

describe('parsePorcelainWorktreeList', () => {
  it('parses normal branch worktree entry', () => {
    const output = `worktree /repo/main
HEAD abcdef123456
branch refs/heads/main

worktree /repo/worktrees/feature
HEAD 123456789abc
branch refs/heads/feature
`;
    const list = parsePorcelainWorktreeList(output);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({
      path: '/repo/worktrees/feature',
      head: '123456789abc',
      branch: 'refs/heads/feature',
      detached: false
    });
    expect(list[0].path).toBe('/repo/main');
  });

  it('parses detached worktree entry', () => {
    const output = `worktree /repo/worktrees/detached
HEAD deadbeefcafebabe
detached
`;
    const list = parsePorcelainWorktreeList(output);
    expect(list).toHaveLength(1);
    expect(list[0].detached).toBe(true);
    expect(list[0].branch).toBeUndefined();
  });

  it('ignores bare worktrees for ordering', () => {
    const output = `worktree /repo/main
HEAD 1111111
branch refs/heads/main

worktree /repo/bare
HEAD 2222222
bare

worktree /repo/worktrees/feature
HEAD 3333333
branch refs/heads/feature
`;
    const list = parsePorcelainWorktreeList(output);
    expect(list).toHaveLength(3);
    const ordered = buildMenuEntries(list, [], 5);
    expect(ordered.main.path).toBe('/repo/main');
    expect(ordered.entries[0].path).toBe('/repo/worktrees/feature');
    expect(ordered.recent).toEqual(['/repo/worktrees/feature']);
  });

  it('handles spaced paths and CRLF output', () => {
    const output = `worktree /repo/main
HEAD 1111111
branch refs/heads/main\r\n
worktree /repo/My Worktrees/feature x\r
HEAD 2222222\r
branch refs/heads/feature-x\r\n
`;
    const list = parsePorcelainWorktreeList(output);
    expect(list).toHaveLength(2);
    expect(list[1].path).toBe('/repo/My Worktrees/feature x');
  });
});

describe('buildMenuEntries and labels', () => {
  it('keeps Main first and applies recent ordering', () => {
    const list = parsePorcelainWorktreeList(`worktree /repo/main
HEAD 1111111
branch refs/heads/main

worktree /repo/worktrees/feature
HEAD 2222222
branch refs/heads/feature

worktree /repo/worktrees/feature2
HEAD 3333333
branch refs/heads/feature2

worktree /repo/worktrees/feature3
HEAD 4444444
branch refs/heads/feature3
`);

    const ordered = buildMenuEntries(list, ['/repo/worktrees/feature2', '/repo/worktrees/feature'], 2);
    expect(ordered.main.path).toBe('/repo/main');
    expect(ordered.entries.map((item) => item.path)).toEqual([
      '/repo/worktrees/feature2',
      '/repo/worktrees/feature'
    ]);
    expect(ordered.entries.map((item) => getDisplayLabel(item).label)).toEqual([
      'feature2',
      'feature'
    ]);
  });

  it('prunes stale recent entries and fills from Git order', () => {
    const list = parsePorcelainWorktreeList(`worktree /repo/main
HEAD 1111111
branch refs/heads/main

worktree /repo/worktrees/feature
HEAD 2222222
branch refs/heads/feature

worktree /repo/worktrees/feature2
HEAD 3333333
branch refs/heads/feature2
`);

    const ordered = buildMenuEntries(list, ['/repo/worktrees/missing', '/repo/worktrees/feature2', '/repo/worktrees/feature'], 5);
    expect(ordered.entries.map((item) => item.path)).toEqual([
      '/repo/worktrees/feature2',
      '/repo/worktrees/feature'
    ]);
    expect(ordered.recent).toEqual([
      '/repo/worktrees/feature2',
      '/repo/worktrees/feature'
    ]);
  });

  it('treats first non-bare worktree as Main even with bare entries before it', () => {
    const list = parsePorcelainWorktreeList(`worktree /repo/bare
HEAD 1111111
bare

worktree /repo/main
HEAD 2222222
branch refs/heads/main

worktree /repo/worktrees/feature
HEAD 3333333
branch refs/heads/feature
`);
    const ordered = buildMenuEntries(list, [], 5);
    expect(ordered.main.path).toBe('/repo/main');
    expect(ordered.entries.map((entry) => entry.path)).toEqual(['/repo/worktrees/feature']);
  });

  it('limits picker entries to five linked worktrees', () => {
    const list = parsePorcelainWorktreeList(`worktree /repo/main
HEAD 1111111
branch refs/heads/main

worktree /repo/worktrees/one
HEAD 1111111
branch refs/heads/one

worktree /repo/worktrees/two
HEAD 2222222
branch refs/heads/two

worktree /repo/worktrees/three
HEAD 3333333
branch refs/heads/three

worktree /repo/worktrees/four
HEAD 4444444
branch refs/heads/four

worktree /repo/worktrees/five
HEAD 5555555
branch refs/heads/five

worktree /repo/worktrees/six
HEAD 6666666
branch refs/heads/six
`);
    const ordered = buildMenuEntries(list, [], 5);
    expect(ordered.entries).toHaveLength(5);
    expect(ordered.entries.map((item) => item.path)).toEqual([
      '/repo/worktrees/one',
      '/repo/worktrees/two',
      '/repo/worktrees/three',
      '/repo/worktrees/four',
      '/repo/worktrees/five'
    ]);
  });

  it('labels detached worktrees with short sha', () => {
    const detached = parsePorcelainWorktreeList(`worktree /repo/worktrees/detached
HEAD deadbeefcafebabe
detached
`);
    const label = getDisplayLabel(detached[0]);
    expect(label.kind).toBe('detached');
    expect(label.label).toBe('Detached deadbee');
  });

  it('uses stable workspace folder names for main and linked worktrees', () => {
    const list = parsePorcelainWorktreeList(`worktree /repo/main
HEAD 1111111
branch refs/heads/main

worktree /repo/worktrees/feature
HEAD 2222222
branch refs/heads/codex/feature
`);

    expect(getWorkspaceFolderName(list[0], true)).toBe('Main');
    expect(getWorkspaceFolderName(list[1], false)).toBe('codex/feature');
  });
});
