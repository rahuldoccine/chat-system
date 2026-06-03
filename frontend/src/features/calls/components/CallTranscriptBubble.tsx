import React, { useCallback, useState } from 'react';
import { handler } from '../../../utils/asyncHandler';
import { Copy, Download, Subtitles } from 'lucide-react';
import styles from './CallTranscriptBubble.module.css';

export type CallTranscriptMeta = {
  callId: string;
  lineCount?: number;
  lines: Array<{ t: number; speaker: string; text: string }>;
};

type CallTranscriptBubbleProps = {
  transcript: CallTranscriptMeta;
  preview: string | null;
};

const CallTranscriptBubble: React.FC<CallTranscriptBubbleProps> = ({ transcript, preview }) => {
  const [copied, setCopied] = useState(false);
  const fullText = transcript.lines.map((l) => l.text).join('\n');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [fullText]);

  const handleDownload = useCallback(() => {
    const text = transcript.lines
      .map((l) => `[${Math.floor(l.t / 1000)}s] ${l.text}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-transcript-${transcript.callId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [transcript.callId, transcript.lines]);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Subtitles size={16} aria-hidden />
          <span>Call transcript</span>
          <span className={styles.count}>{transcript.lines.length} lines</span>
        </div>
        <p className={styles.preview}>{preview ?? fullText.slice(0, 280)}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn} onClick={handler(handleCopy)}>
            <Copy size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className={styles.actionBtn} onClick={handleDownload}>
            <Download size={14} />
            Download
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallTranscriptBubble;

export function getCallTranscriptFromMeta(contentMeta: unknown): CallTranscriptMeta | null {
  if (!contentMeta || typeof contentMeta !== 'object') return null;
  const raw = (contentMeta as { callTranscript?: unknown }).callTranscript;
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as CallTranscriptMeta;
  if (!t.callId || !Array.isArray(t.lines)) return null;
  return t;
}
