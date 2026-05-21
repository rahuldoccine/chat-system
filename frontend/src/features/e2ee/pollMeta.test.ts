import { describe, expect, it } from 'vitest';
import { mergePollWithDecrypted, parseE2eePollMeta } from './pollMeta';

describe('pollMeta', () => {
  it('parses encrypted poll meta', () => {
    const parsed = parseE2eePollMeta({
      poll: {
        question: 'Favorite color?',
        closesAt: null,
        options: [{ label: 'Red' }, { label: 'Blue' }],
      },
    });
    expect(parsed?.question).toBe('Favorite color?');
    expect(parsed?.options).toHaveLength(2);
  });

  it('merges decrypted labels onto server poll', () => {
    const merged = mergePollWithDecrypted(
      {
        id: 'p1',
        chatId: 'c1',
        question: '',
        closesAt: null,
        createdAt: new Date().toISOString(),
        isE2ee: true,
        options: [
          { id: 'o1', label: '', sortOrder: 0, votes: 1 },
          { id: 'o2', label: '', sortOrder: 1, votes: 0 },
        ],
      },
      {
        question: 'Q?',
        closesAt: null,
        options: [
          { label: 'A', sortOrder: 0 },
          { label: 'B', sortOrder: 1 },
        ],
      },
    );
    expect(merged.question).toBe('Q?');
    expect(merged.options[0]?.label).toBe('A');
    expect(merged.options[1]?.label).toBe('B');
  });
});
