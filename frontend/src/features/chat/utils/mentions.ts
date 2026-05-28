export type ParsedMentions = {
  userIds: string[];
  all: boolean;
  displayText: string;
};

function normalizeHandle(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
}

/** Parse @username tokens and @all from composer text (plaintext groups). */
export function parseMentionsFromText(
  text: string,
  members: Array<{ userId: string; username?: string | null; email: string; displayName?: string | null }>,
): ParsedMentions {
  const userIds = new Set<string>();
  let all = false;
  const tokens = text.match(/@([a-zA-Z0-9_.-]+)/g) ?? [];
  for (const token of tokens) {
    const handle = normalizeHandle(token.slice(1));
    if (handle === 'all') {
      all = true;
      continue;
    }
    const match = members.find((m) => {
      const un = m.username ? normalizeHandle(m.username) : undefined;
      const emailLocal = normalizeHandle(m.email.split('@')[0] ?? '');
      const dn = normalizeHandle((m.displayName ?? '').replace(/\s+/g, ''));
      return un === handle || emailLocal === handle || dn === handle;
    });
    if (match) userIds.add(match.userId);
  }
  return { userIds: [...userIds], all, displayText: text };
}

export function splitMentionSegments(text: string): Array<{ type: 'text' | 'mention'; value: string }> {
  const parts: Array<{ type: 'text' | 'mention'; value: string }> = [];
  const re = /@[a-zA-Z0-9_.-]+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', value: text.slice(last, m.index) });
    }
    parts.push({ type: 'mention', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts.length ? parts : [{ type: 'text', value: text }];
}
