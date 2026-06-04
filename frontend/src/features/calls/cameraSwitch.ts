export type CameraFacing = 'user' | 'environment';

export function nextCameraFacing(current: CameraFacing): CameraFacing {
  return current === 'user' ? 'environment' : 'user';
}

export function cameraFacingFromTrack(track: MediaStreamTrack): CameraFacing | null {
  const mode = track.getSettings().facingMode;
  if (mode === 'user' || mode === 'environment') return mode;
  return null;
}

async function replaceVideoTrackInCall(
  pc: RTCPeerConnection,
  localStream: MediaStream,
  oldTrack: MediaStreamTrack,
  newTrack: MediaStreamTrack,
): Promise<void> {
  const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
  if (sender) await sender.replaceTrack(newTrack);
  oldTrack.stop();
  localStream.removeTrack(oldTrack);
  localStream.addTrack(newTrack);
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

async function tryFacingConstraints(
  track: MediaStreamTrack,
  facing: CameraFacing,
): Promise<boolean> {
  const attempts: MediaTrackConstraints[] = [
    { facingMode: { exact: facing } },
    { facingMode: { ideal: facing } },
    { facingMode: facing },
  ];
  for (const video of attempts) {
    try {
      await track.applyConstraints(video);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function tryNewTrackWithFacing(
  pc: RTCPeerConnection,
  localStream: MediaStream,
  oldTrack: MediaStreamTrack,
  facing: CameraFacing,
): Promise<boolean> {
  const attempts: MediaTrackConstraints[] = [
    { facingMode: { exact: facing } },
    { facingMode: { ideal: facing } },
    { facingMode: facing },
  ];
  for (const video of attempts) {
    try {
      const newTrack = await openVideoTrack(video);
      if (!newTrack) continue;
      await replaceVideoTrackInCall(pc, localStream, oldTrack, newTrack);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function tryNextVideoDevice(
  pc: RTCPeerConnection,
  localStream: MediaStream,
  oldTrack: MediaStreamTrack,
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
    await replaceVideoTrackInCall(pc, localStream, oldTrack, newTrack);
    return true;
  } catch {
    return false;
  }
}

/** Switch front/back (or next camera) during an active video call. */
export async function switchCallCamera(
  pc: RTCPeerConnection,
  localStream: MediaStream,
  preferredFacing: CameraFacing,
): Promise<{ ok: boolean; facing: CameraFacing }> {
  const oldTrack = localStream.getVideoTracks()[0];
  if (!oldTrack) return { ok: false, facing: preferredFacing };

  const next = nextCameraFacing(preferredFacing);

  if (await tryFacingConstraints(oldTrack, next)) {
    return { ok: true, facing: next };
  }

  if (await tryNewTrackWithFacing(pc, localStream, oldTrack, next)) {
    return { ok: true, facing: next };
  }

  if (await tryNextVideoDevice(pc, localStream, oldTrack)) {
    const updated = localStream.getVideoTracks()[0];
    const facing = updated ? (cameraFacingFromTrack(updated) ?? next) : next;
    return { ok: true, facing };
  }

  return { ok: false, facing: preferredFacing };
}
