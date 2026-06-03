import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api/axios';
import { socketService } from '../../services/socket';
import { emitCallTranscriptLine } from './callSignaling';

export type TranscriptLine = { t: number; speaker: string; text: string };

export type CaptionRow = {
  key: string;
  speaker: string;
  text: string;
};

type SpeechRecognitionErrorCode =
  | 'no-speech'
  | 'aborted'
  | 'audio-capture'
  | 'network'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'bad-grammar'
  | 'language-not-supported';

type SpeechRecognitionErrorEvent = {
  error: SpeechRecognitionErrorCode;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type UseCallTranscriptOptions = {
  peerName?: string;
  myLabel?: string;
  /** When true, pause mic recognition (WebRTC mute). */
  muted?: boolean;
  /** Wait until call media is up before starting STT. */
  mediaReady?: boolean;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  const w = globalThis.window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function isFatalSpeechError(code: SpeechRecognitionErrorCode): boolean {
  return code === 'not-allowed' || code === 'service-not-allowed';
}

function errorHint(code: SpeechRecognitionErrorCode): string | null {
  switch (code) {
    case 'audio-capture':
      return 'Microphone is busy (call + captions). Your words still go to the other person.';
    case 'aborted':
      return 'Speech capture paused — only one captions session per browser. Use two browsers to test both sides.';
    case 'network':
      return 'Speech service unreachable. Check internet connection.';
    case 'not-allowed':
      return 'Microphone permission denied for captions.';
    default:
      return null;
  }
}

export const CAPTION_LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
] as const;

const LANG_STORAGE_KEY = 'call-caption-lang';

function readStoredLang(): string {
  try {
    return sessionStorage.getItem(LANG_STORAGE_KEY) ?? 'en-US';
  } catch {
    return 'en-US';
  }
}

export function useCallTranscript(
  callId: string | null,
  options: UseCallTranscriptOptions = {},
) {
  const { peerName = 'Them', myLabel = 'You', muted = false, mediaReady = true } = options;

  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [remoteLines, setRemoteLines] = useState<TranscriptLine[]>([]);
  const [interimText, setInterimText] = useState('');
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [language, setLanguage] = useState(readStoredLang);

  const languageRef = useRef(language);
  languageRef.current = language;
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const startedRef = useRef<number | null>(null);
  const wantedRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callIdRef = useRef(callId);
  callIdRef.current = callId;
  const peerNameRef = useRef(peerName);
  peerNameRef.current = peerName;
  const myLabelRef = useRef(myLabel);
  myLabelRef.current = myLabel;
  const abortedStreakRef = useRef(0);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    clearRestartTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setInterimText('');
  }, [clearRestartTimer]);

  const pushLocalLine = useCallback((text: string, t: number) => {
    const line: TranscriptLine = { t, speaker: myLabelRef.current, text };
    setLines((prev) => [...prev, line]);
    setStatusHint(null);
    const id = callIdRef.current;
    if (id) {
      emitCallTranscriptLine({ callId: id, text, t });
    }
  }, []);

  const attachRecognition = useCallback(
    (scheduleRestart: (delayMs?: number) => void) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor || !wantedRef.current || muted) return false;

      stopRecognition();
      startedRef.current ??= Date.now();

      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = languageRef.current;
      rec.onresult = (ev: SpeechRecognitionEvent) => {
        const startMs = startedRef.current ?? Date.now();
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const text = r[0]?.transcript?.trim();
          if (!text) continue;
          if (!r.isFinal) {
            interim = text;
            continue;
          }
          pushLocalLine(text, Date.now() - startMs);
        }
        setInterimText(interim);
      };
      rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
        if (!wantedRef.current) return;
        const hint = errorHint(ev.error);
        if (hint) setStatusHint(hint);

        if (isFatalSpeechError(ev.error)) {
          wantedRef.current = false;
          stopRecognition();
          setEnabled(false);
          return;
        }

        if (ev.error === 'aborted') {
          abortedStreakRef.current += 1;
        } else {
          abortedStreakRef.current = 0;
        }

        stopRecognition();
        let delay = 300;
        if (ev.error === 'aborted') {
          delay = Math.min(2000, 400 + abortedStreakRef.current * 300);
        } else if (ev.error === 'network') {
          delay = 1000;
        }
        scheduleRestart(delay);
      };
      rec.onend = () => {
        if (!wantedRef.current || muted) return;
        stopRecognition();
        scheduleRestart(200);
      };

      try {
        rec.start();
        recognitionRef.current = rec;
        setEnabled(true);
        return true;
      } catch {
        setStatusHint('Could not start speech recognition. Try Chrome on desktop.');
        scheduleRestart(500);
        return false;
      }
    },
    [muted, pushLocalLine, stopRecognition],
  );

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setStatusHint('Captions are not supported in this browser. Try Chrome or Edge.');
      return false;
    }

    wantedRef.current = true;
    abortedStreakRef.current = 0;
    setEnabled(true);
    setStatusHint(null);
    startedRef.current ??= Date.now();

    const scheduleRestart = (delayMs = 300) => {
      if (!wantedRef.current || muted) return;
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        attachRecognition(scheduleRestart);
      }, delayMs);
    };

    if (!mediaReady) {
      setStatusHint('Waiting for call audio…');
      return true;
    }

    return attachRecognition(scheduleRestart);
  }, [attachRecognition, clearRestartTimer, mediaReady, muted]);

  const stop = useCallback(() => {
    wantedRef.current = false;
    stopRecognition();
    setEnabled(false);
    setStatusHint(null);
  }, [stopRecognition]);

  const toggle = useCallback(() => {
    if (wantedRef.current) {
      stop();
      return;
    }
    start();
  }, [start, stop]);

  useEffect(() => {
    if (!wantedRef.current || !enabled || muted || !mediaReady) {
      stopRecognition();
      return;
    }
    start();
  }, [enabled, mediaReady, muted, start, stopRecognition]);

  useEffect(() => {
    if (!callId) return;
    const onRemote = (payload: {
      callId: string;
      fromUserId: string;
      t: number;
      text: string;
    }) => {
      if (payload.callId !== callId) return;
      const line: TranscriptLine = {
        t: payload.t,
        speaker: peerNameRef.current,
        text: payload.text,
      };
      setRemoteLines((prev) => [...prev, line]);
    };
    socketService.on('call:transcript', onRemote);
    return () => {
      socketService.off('call:transcript', onRemote);
    };
  }, [callId]);

  const displayRows: CaptionRow[] = useMemo(() => {
    const merged = [...lines, ...remoteLines].sort((a, b) => a.t - b.t).slice(-5);
    return merged.map((line, i) => ({
      key: `${line.speaker}-${line.t}-${i}`,
      speaker: line.speaker,
      text: line.text,
    }));
  }, [lines, remoteLines]);

  const upload = useCallback(async () => {
    const all = [...lines, ...remoteLines].sort((a, b) => a.t - b.t);
    if (!callId || all.length === 0) return;
    const payload = { transcript: all, postToChat: true };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await api.patch(`/calls/${callId}/transcript`, payload);
        return;
      } catch {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 400 * (attempt + 1));
        });
      }
    }
  }, [callId, lines, remoteLines]);

  const reset = useCallback(() => {
    stop();
    setLines([]);
    setRemoteLines([]);
    setInterimText('');
    startedRef.current = null;
  }, [stop]);

  const applyLanguage = useCallback(
    (code: string) => {
      setLanguage(code);
      try {
        sessionStorage.setItem(LANG_STORAGE_KEY, code);
      } catch {
        /* ignore */
      }
      if (wantedRef.current) {
        stopRecognition();
        start();
      }
    },
    [start, stopRecognition],
  );

  const copyToClipboard = useCallback(async (): Promise<boolean> => {
    const all = [...lines, ...remoteLines].sort((a, b) => a.t - b.t);
    if (!all.length) return false;
    const text = all.map((l) => `${l.speaker}: ${l.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, [lines, remoteLines]);

  const downloadText = useCallback(() => {
    const all = [...lines, ...remoteLines].sort((a, b) => a.t - b.t);
    if (!all.length) return;
    const text = all.map((l) => `[${Math.floor(l.t / 1000)}s] ${l.speaker}: ${l.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-transcript-${callId ?? 'session'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [callId, lines, remoteLines]);

  useEffect(() => {
    return () => {
      clearRestartTimer();
      stopRecognition();
    };
  }, [clearRestartTimer, stopRecognition]);

  const supported = Boolean(getSpeechRecognitionCtor());
  const hasCaptions =
    displayRows.length > 0 || Boolean(interimText.trim());

  return {
    enabled,
    lines,
    remoteLines,
    displayRows,
    interimText,
    statusHint,
    hasCaptions,
    language,
    supported,
    toggle,
    stop,
    upload,
    reset,
    applyLanguage,
    copyToClipboard,
    downloadText,
  };
}
