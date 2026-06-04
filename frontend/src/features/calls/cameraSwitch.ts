export type CameraFacing = 'user' | 'environment';

export const DEFAULT_CAMERA_FACING: CameraFacing = 'user';

export function nextCameraFacing(current: CameraFacing): CameraFacing {
  return current === 'user' ? 'environment' : 'user';
}

/** Phones and tablets where front/back facingMode is meaningful. */
export function isHandheldMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function cameraFacingFromTrack(track: MediaStreamTrack): CameraFacing | null {
  const mode = track.getSettings().facingMode;
  if (mode === 'user' || mode === 'environment') return mode;
  return null;
}

function facingFromDeviceLabel(label: string): CameraFacing | null {
  const l = label.toLowerCase();
  if (/back|rear|environment|trás|arrière|rück/i.test(l)) return 'environment';
  if (/front|user|face|selfie|facetime|integrated|built.?in/i.test(l)) return 'user';
  return null;
}

function resolveFacingAfterSwitch(localStream: MediaStream, fallback: CameraFacing): CameraFacing {
  const track = localStream.getVideoTracks()[0];
  if (!track) return fallback;
  return cameraFacingFromTrack(track) ?? facingFromDeviceLabel(track.label) ?? fallback;
}

function replaceVideoTrackInStream(
  localStream: MediaStream,
  oldTrack: MediaStreamTrack,
  newTrack: MediaStreamTrack,
): void {
  oldTrack.stop();
  localStream.removeTrack(oldTrack);
  localStream.addTrack(newTrack);
}

async function replaceVideoTrack(
  localStream: MediaStream,
  oldTrack: MediaStreamTrack,
  newTrack: MediaStreamTrack,
  pc?: RTCPeerConnection | null,
): Promise<void> {
  if (pc) {
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(newTrack);
  }
  replaceVideoTrackInStream(localStream, oldTrack, newTrack);
}

function stopExtraTracks(stream: MediaStream, keep: MediaStreamTrack): void {
  for (const t of stream.getTracks()) {
    if (t !== keep) t.stop();
  }
}

async function openVideoTrack(
  constraints: MediaTrackConstraints,
): Promise<MediaStreamTrack | null> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
  const track = stream.getVideoTracks()[0] ?? null;
  if (track) stopExtraTracks(stream, track);
  else stream.getTracks().forEach((t) => t.stop());
  return track;
}

/** Default video constraints: front-facing (user) on mobile and desktop webcam. */
export function defaultVideoConstraints(): MediaTrackConstraints {
  return {
    facingMode: { ideal: DEFAULT_CAMERA_FACING },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
}

async function openVideoTrackWithFacing(
  facing: CameraFacing,
): Promise<MediaStreamTrack | null> {
  const attempts: MediaTrackConstraints[] = [
    { facingMode: { exact: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: facing },
  ];
  for (const video of attempts) {
    try {
      const track = await openVideoTrack(video);
      if (track) return track;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function switchToFacing(
  localStream: MediaStream,
  oldTrack: MediaStreamTrack,
  facing: CameraFacing,
  pc?: RTCPeerConnection | null,
): Promise<boolean> {
  const newTrack = await openVideoTrackWithFacing(facing);
  if (!newTrack) return false;
  await replaceVideoTrack(localStream, oldTrack, newTrack, pc);
  return true;
}

async function tryNextVideoDevice(
  localStream: MediaStream,
  oldTrack: MediaStreamTrack,
  pc?: RTCPeerConnection | null,
): Promise<boolean> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
  if (videoInputs.length < 2) return false;

  const currentId = oldTrack.getSettings().deviceId;
  const currentIndex = videoInputs.findIndex((d) => d.deviceId === currentId);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % videoInputs.length;
  const nextDevice = videoInputs[nextIndex];
  if (!nextDevice?.deviceId) return false;

  try {
    const newTrack = await openVideoTrack({ deviceId: { exact: nextDevice.deviceId } });
    if (!newTrack) return false;
    await replaceVideoTrack(localStream, oldTrack, newTrack, pc);
    return true;
  } catch {
    return false;
  }
}

/**
 * Toggle camera: front ↔ rear on mobile; cycle webcams on desktop.
 */
export async function switchVideoCamera(
  localStream: MediaStream,
  currentFacing: CameraFacing,
  pc?: RTCPeerConnection | null,
): Promise<{ ok: boolean; facing: CameraFacing }> {
  const oldTrack = localStream.getVideoTracks()[0];
  if (!oldTrack) return { ok: false, facing: currentFacing };

  const next = nextCameraFacing(currentFacing);

  if (isHandheldMobile()) {
    if (await switchToFacing(localStream, oldTrack, next, pc)) {
      return { ok: true, facing: resolveFacingAfterSwitch(localStream, next) };
    }
    return { ok: false, facing: currentFacing };
  }

  if (await tryNextVideoDevice(localStream, oldTrack, pc)) {
    return { ok: true, facing: resolveFacingAfterSwitch(localStream, next) };
  }

  if (await switchToFacing(localStream, oldTrack, next, pc)) {
    return { ok: true, facing: resolveFacingAfterSwitch(localStream, next) };
  }

  return { ok: false, facing: currentFacing };
}

/** @deprecated Use switchVideoCamera — kept for CallManager import stability. */
export async function switchCallCamera(
  pc: RTCPeerConnection,
  localStream: MediaStream,
  preferredFacing: CameraFacing,
): Promise<{ ok: boolean; facing: CameraFacing }> {
  return switchVideoCamera(localStream, preferredFacing, pc);
}

/** @deprecated Use switchVideoCamera — kept for GroupCallProvider import stability. */
export async function replaceLocalVideoTrack(
  localStream: MediaStream,
  preferredFacing: CameraFacing,
): Promise<{ ok: boolean; facing: CameraFacing }> {
  return switchVideoCamera(localStream, preferredFacing, null);
}
