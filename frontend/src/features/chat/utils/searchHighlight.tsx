import React from 'react';

export type TextPart = { text: string; match: boolean; offset: number };

export function splitTextByQuery(text: string, query: string): TextPart[] {
  const q = query.trim();
  if (!q) return [{ text, match: false, offset: 0 }];

  const parts: TextPart[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let start = 0;

  while (start < text.length) {
    const idx = lower.indexOf(needle, start);
    if (idx === -1) {
      parts.push({ text: text.slice(start), match: false, offset: start });
      break;
    }
    if (idx > start) {
      parts.push({ text: text.slice(start, idx), match: false, offset: start });
    }
    parts.push({ text: text.slice(idx, idx + needle.length), match: true, offset: idx });
    start = idx + needle.length;
  }

  return parts.length ? parts : [{ text, match: false, offset: 0 }];
}

type HighlightedMessageTextProps = {
  text: string;
  query: string;
  isActiveMessage?: boolean;
  markClassName: string;
  markActiveClassName: string;
};

import { splitMentionSegments } from './mentions';

type MentionHighlightedTextProps = {
  text: string;
  mentionClassName: string;
};

export const MentionHighlightedText: React.FC<MentionHighlightedTextProps> = ({
  text,
  mentionClassName,
}) => {
  const parts = splitMentionSegments(text);
  return (
    <>
      {parts.map((part) =>
        part.type === 'mention' ? (
          <mark key={`${part.offset}:${part.value}`} className={mentionClassName}>
            {part.value}
          </mark>
        ) : (
          <React.Fragment key={`${part.offset}:${part.value}`}>{part.value}</React.Fragment>
        ),
      )}
    </>
  );
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
      {parts.map((part) =>
        part.match ? (
          <mark
            key={`${part.offset}:${part.text}`}
            className={isActiveMessage ? markActiveClassName : markClassName}
          >
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={`${part.offset}:${part.text}`}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
};
