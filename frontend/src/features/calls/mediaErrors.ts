/** Map microphone/camera errors to plain language (never log SDP). */
export function formatMediaError(err: unknown, wantsVideo: boolean): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        if (wantsVideo) {
          return 'No camera or microphone was found. Connect a device or start a voice call instead.';
        }
        return 'No microphone was found. Connect a microphone or check your sound settings.';
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Please allow access to your microphone and camera in your browser settings, then try again.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Your microphone or camera is being used by another app. Close other apps and try again.';
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return wantsVideo
          ? 'Your camera is not available right now. Try a voice call or another device.'
          : 'Your microphone is not available. Check your sound settings and try again.';
      case 'SecurityError':
        return 'Your browser blocked access to the microphone or camera. Use a secure connection and allow permissions for this site.';
      case 'NotSupportedError':
        return wantsVideo
          ? 'Video calls are not supported in this browser.'
          : 'Voice calls are not supported in this browser.';
      default:
        break;
    }
  }
  if (err instanceof Error && err.message && !/failed to create|sdp|ice|peer/i.test(err.message)) {
    return err.message;
  }
  return wantsVideo
    ? 'We could not start your camera or microphone. Check your devices and try again.'
    : 'We could not start your microphone. Check your device and try again.';
}

export type AcquireMediaResult = {
  stream: MediaStream;
  /** True if video was requested but only audio was obtained (no camera). */
  videoFallback: boolean;
};

/**
 * Request mic (+ optional camera). Video calls fall back to audio-only if no camera is found.
 */
export async function acquireUserMedia(wantsVideo: boolean): Promise<AcquireMediaResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Not supported', 'NotSupportedError');
  }

  const audioConstraints: MediaTrackConstraints | boolean = {
    echoCancellation: true,
    noiseSuppression: true,
  };

  if (!wantsVideo) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });
    return { stream, videoFallback: false };
  }

  const videoAttempts: MediaTrackConstraints[] = [
    { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    { width: { ideal: 1280 }, height: { ideal: 720 } },
  ];

  let lastError: unknown;
  for (const video of videoAttempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video,
      });
      return { stream, videoFallback: false };
    } catch (e) {
      lastError = e;
      const over =
        e instanceof DOMException &&
        (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError');
      if (!over) break;
    }
  }

  if (!lastError) {
    throw new DOMException('No camera available', 'NotFoundError');
  }

  const notFound =
    lastError instanceof DOMException &&
    (lastError.name === 'NotFoundError' || lastError.name === 'DevicesNotFoundError');
  const overconstrained =
    lastError instanceof DOMException &&
    (lastError.name === 'OverconstrainedError' || lastError.name === 'ConstraintNotSatisfiedError');

  if (!notFound && !overconstrained) throw lastError;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });
    return { stream, videoFallback: true };
  } catch {
    throw lastError;
  }
}
