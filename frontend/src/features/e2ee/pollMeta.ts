import { isPlainObject } from '../../utils/plainObject';

export type E2eePollPayload = {
  question: string;
  closesAt?: string | null;
  options: Array<{ label: string; sortOrder: number }>;
};

export function parseE2eePollMeta(meta: Record<string, unknown> | undefined): E2eePollPayload | null {
  if (!meta) return null;
  const raw = meta.poll;
  if (!isPlainObject(raw)) return null;
  const rec = raw;
  const question = typeof rec.question === 'string' ? rec.question : '';
  if (!question.trim()) return null;

  let closesAt: string | null = null;
  if (typeof rec.closesAt === 'string') {
    closesAt = rec.closesAt;
  }

  const optionsRaw = rec.options;
  if (!Array.isArray(optionsRaw)) return null;
  const options: Array<{ label: string; sortOrder: number }> = [];
  for (let i = 0; i < optionsRaw.length; i++) {
    const entry = optionsRaw[i];
    if (!isPlainObject(entry)) continue;
    const label = entry.label;
    if (typeof label === 'string' && label.trim()) {
      options.push({ label: label.trim(), sortOrder: i });
    }
  }

  if (options.length < 2) return null;
  return { question: question.trim(), closesAt, options };
}

/** Merge server poll options (ids, votes) with decrypted labels by sortOrder. */
export function mergePollWithDecrypted<T extends { question: string; closesAt: string | null; options: Array<{ id: string; label: string; sortOrder: number }> }>(
  server: T,
  decrypted: E2eePollPayload | null,
): T {
  if (!decrypted) return server;
  const labelByOrder = new Map(decrypted.options.map((o) => [o.sortOrder, o.label]));
  return {
    ...server,
    question: decrypted.question,
    closesAt: decrypted.closesAt ?? server.closesAt,
    options: server.options.map((opt) => ({
      ...opt,
      label: labelByOrder.get(opt.sortOrder) ?? opt.label,
    })),
  };
}
