import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '../../../config/env';

export const VOICE_MIN_MS = 400;

export type VoiceRecorderState = 'idle' | 'recording' | 'error';

export type VoiceRecordingResult = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

function extensionForMime(mime: string): string {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  return 'webm';
}

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopResolveRef = useRef<((r: VoiceRecordingResult | null) => void) | null>(null);
  const maxMs = env.maxVoiceNoteSeconds * 1000;

  const cleanupStream = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const finishRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    const startedAt = startedAtRef.current;
    const durationMs = Math.max(0, Date.now() - startedAt);
    const mimeType = rec?.mimeType || pickRecorderMimeType() || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    cleanupStream();
    setState('idle');
    setElapsedMs(0);
    return { blob, mimeType, durationMs };
  }, [cleanupStream]);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const cancel = useCallback(() => {
    stopResolveRef.current?.(null);
    stopResolveRef.current = null;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      rec.onerror = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    cleanupStream();
    setState('idle');
    setElapsedMs(0);
    setError(null);
  }, [cleanupStream]);

  const stop = useCallback((): Promise<VoiceRecordingResult | null> => {
    return new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === 'inactive' || !streamRef.current) {
        cleanupStream();
        setState('idle');
        setElapsedMs(0);
        resolve(null);
        return;
      }

      stopResolveRef.current = resolve;

      rec.onstop = () => {
        const result = finishRecording();
        const pending = stopResolveRef.current;
        stopResolveRef.current = null;
        pending?.(result);
      };

      rec.onerror = () => {
        cleanupStream();
        setState('error');
        setError("Recording didn't work. Please try again.");
        const pending = stopResolveRef.current;
        stopResolveRef.current = null;
        pending?.(null);
      };

      try {
        rec.stop();
      } catch {
        cleanupStream();
        setState('idle');
        stopResolveRef.current?.(null);
        stopResolveRef.current = null;
        resolve(null);
      }
    });
  }, [cleanupStream, finishRecording]);

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Voice messages are not supported in this browser');
      setState('error');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('Voice messages are not supported in this browser');
      setState('error');
      return;
    }

    cancel();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setError(null);
      setState('recording');

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const result = finishRecording();
        const pending = stopResolveRef.current;
        stopResolveRef.current = null;
        pending?.(result);
      };

      recorder.onerror = () => {
        cleanupStream();
        setState('error');
        setError("Recording didn't work. Please try again.");
        const pending = stopResolveRef.current;
        stopResolveRef.current = null;
        pending?.(null);
      };

      recorder.start(200);

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= maxMs && recorder.state === 'recording') {
          void stop();
        }
      }, 100);
    } catch (err) {
      cleanupStream();
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Please allow microphone access in your browser settings');
      } else {
        setError("We couldn't use your microphone. Check your device and try again.");
      }
      setState('error');
    }
  }, [cancel, cleanupStream, finishRecording, maxMs, stop]);

  const toVoiceFile = useCallback((result: VoiceRecordingResult): File => {
    const ext = extensionForMime(result.mimeType);
    return new File([result.blob], `voice-${Date.now()}.${ext}`, {
      type: result.mimeType,
    });
  }, []);

  return {
    state,
    elapsedMs,
    error,
    isRecording: state === 'recording',
    start,
    stop,
    cancel,
    toVoiceFile,
    maxMs,
    minMs: VOICE_MIN_MS,
  };
}
