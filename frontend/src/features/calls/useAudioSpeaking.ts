import { useEffect, useState } from 'react';

/** True when the stream's audio level exceeds a threshold (voice activity). */
export function useAudioSpeaking(stream: MediaStream | null, threshold = 0.04): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!track?.enabled) {
      setSpeaking(false);
      return;
    }

    let cancelled = false;
    let raf = 0;
    let ctx: AudioContext | null = null;

    const run = async () => {
      try {
        ctx = new AudioContext();
        await ctx.resume();
        if (!stream) return;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.85;
        source.connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(bins);
          let sum = 0;
          for (const value of bins) sum += value;
          const level = sum / bins.length / 255;
          setSpeaking(level > threshold);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setSpeaking(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      void ctx?.close();
    };
  }, [stream, threshold]);

  return speaking;
}
