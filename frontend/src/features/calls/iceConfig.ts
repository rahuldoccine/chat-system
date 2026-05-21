import { env } from '../../config/env';

export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: env.stunUrls }];
  if (env.turnUrl && env.turnUsername) {
    servers.push({
      urls: env.turnUrl,
      username: env.turnUsername,
      credential: env.turnCredential,
    });
  }
  return servers;
}
