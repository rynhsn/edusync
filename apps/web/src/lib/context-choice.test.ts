import { describe, expect, it } from 'vitest';
import {
  buildContexts,
  decideEntry,
  lastContextKey,
  nextFocusIndex,
  orderByLast,
  readLastContext,
  schoolContextId,
  writeLastContext,
} from './context-choice';

const staffPerms = ['student:read', 'portal:read'];
const portalPerms = ['portal:read', 'announcement:read'];

const memberships = [
  { schoolSlug: 'b', schoolName: 'SMP Beta', permissions: portalPerms },
  { schoolSlug: 'a', schoolName: 'SD Alfa', permissions: staffPerms },
];

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('buildContexts', () => {
  it('orders platform, owner, then schools alphabetically with role summary', () => {
    const list = buildContexts({ isStaff: true, isOwner: true, memberships });
    expect(list.map((c) => c.id)).toEqual(['platform', 'owner', 'school:a', 'school:b']);
    expect(list[2]?.role).toBe('staff');
    expect(list[3]?.role).toBe('guardian');
  });
});

describe('decideEntry', () => {
  it('does nothing without any context', () => {
    expect(decideEntry(buildContexts({ isStaff: false, isOwner: false, memberships: [] }))).toEqual({
      action: 'none',
    });
  });

  it('goes straight to a single context', () => {
    const staffOnly = decideEntry(buildContexts({ isStaff: true, isOwner: false, memberships: [] }));
    expect(staffOnly).toMatchObject({ action: 'go', context: { kind: 'platform' } });
    const ownerOnly = decideEntry(buildContexts({ isStaff: false, isOwner: true, memberships: [] }));
    expect(ownerOnly).toMatchObject({ action: 'go', context: { kind: 'owner' } });
    const oneSchool = decideEntry(
      buildContexts({ isStaff: false, isOwner: false, memberships: [memberships[0]!] }),
    );
    expect(oneSchool).toMatchObject({ action: 'go', context: { id: 'school:b', role: 'guardian' } });
  });

  it('shows the chooser for several contexts, last opened first', () => {
    const contexts = buildContexts({ isStaff: true, isOwner: false, memberships });
    const result = decideEntry(contexts, 'school:b');
    expect(result.action).toBe('choose');
    if (result.action === 'choose')
      expect(result.contexts.map((c) => c.id)).toEqual(['school:b', 'platform', 'school:a']);
  });

  it('treats staff who also belong to a school as a multi-context user', () => {
    expect(
      decideEntry(buildContexts({ isStaff: true, isOwner: false, memberships: [memberships[1]!] })).action,
    ).toBe('choose');
  });
});

describe('orderByLast', () => {
  it('ignores unknown ids', () => {
    const contexts = buildContexts({ isStaff: true, isOwner: true, memberships: [] });
    expect(orderByLast(contexts, 'school:gone')).toBe(contexts);
    expect(orderByLast(contexts, null)).toBe(contexts);
  });
});

describe('nextFocusIndex', () => {
  it('moves and wraps', () => {
    expect(nextFocusIndex('ArrowDown', 2, 3)).toBe(0);
    expect(nextFocusIndex('ArrowUp', 0, 3)).toBe(2);
    expect(nextFocusIndex('Home', 2, 3)).toBe(0);
    expect(nextFocusIndex('End', 0, 3)).toBe(2);
    expect(nextFocusIndex('a', 0, 3)).toBeNull();
    expect(nextFocusIndex('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('last context storage', () => {
  it('stores per user and survives a throwing storage', () => {
    const storage = fakeStorage();
    writeLastContext('u1', schoolContextId('a'), storage);
    expect(storage.data[lastContextKey('u1')]).toBe('school:a');
    expect(readLastContext('u1', storage)).toBe('school:a');
    expect(readLastContext('u2', storage)).toBeNull();

    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readLastContext('u1', broken)).toBeNull();
    expect(() => writeLastContext('u1', 'owner', broken)).not.toThrow();
    expect(readLastContext('u1', null)).toBeNull();
  });
});
