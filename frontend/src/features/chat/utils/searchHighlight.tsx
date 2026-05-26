import React from 'react';

export type TextPart = { text: string; match: boolean };

export function splitTextByQuery(text: string, query: string): TextPart[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];

  const parts: TextPart[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let start = 0;

  while (start < text.length) {
    const idx = lower.indexOf(needle, start);
    if (idx === -1) {
      parts.push({ text: text.slice(start), match: false });
      break;
    }
    if (idx > start) parts.push({ text: text.slice(start, idx), match: false });
    parts.push({ text: text.slice(idx, idx + needle.length), match: true });
    start = idx + needle.length;
  }

  return parts.length ? parts : [{ text, match: false }];
}

type HighlightedMessageTextProps = {
  text: string;
  query: string;
  isActiveMessage?: boolean;
  markClassName: string;
  markActiveClassName: string;
};

export const HighlightedMessageText: React.FC<HighlightedMessageTextProps> = ({
  text,
  query,
  isActiveMessage = false,
  markClassName,
  markActiveClassName,
}) => {
  const parts = splitTextByQuery(text, query);
  if (!query.trim()) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark
            key={i}
            className={isActiveMessage ? markActiveClassName : markClassName}
          >
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
};
