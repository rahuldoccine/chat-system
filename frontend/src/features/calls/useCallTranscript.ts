import { useCallback, useRef, useState } from 'react';
import api from '../../api/axios';

export type TranscriptLine = { t: number; speaker: string; text: string };

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useCallTranscript(callId: string | null) {
  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const startedRef = useRef<number | null>(null);
  const enabledRef = useRef(false);

  const stop = useCallback(() => {
    enabledRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setEnabled(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return false;
    startedRef.current = Date.now();
    enabledRef.current = true;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const startMs = startedRef.current ?? Date.now();
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r.isFinal) continue;
        const text = r[0]?.transcript?.trim();
        if (!text) continue;
        setLines((prev) => [
          ...prev,
          { t: Date.now() - startMs, speaker: 'local', text },
        ]);
      }
    };
    rec.onerror = () => stop();
    rec.onend = () => {
      if (enabledRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setEnabled(true);
      return true;
    } catch {
      enabledRef.current = false;
      return false;
    }
  }, [stop]);

  const toggle = useCallback(() => {
    if (enabledRef.current) {
      stop();
      return;
    }
    start();
  }, [start, stop]);

  const upload = useCallback(async () => {
    if (!callId || lines.length === 0) return;
    await api.patch(`/calls/${callId}/transcript`, { transcript: lines });
  }, [callId, lines]);

  const reset = useCallback(() => {
    stop();
    setLines([]);
    startedRef.current = null;
  }, [stop]);

  const supported = Boolean(getSpeechRecognitionCtor());

  return { enabled, lines, supported, toggle, stop, upload, reset };
}
