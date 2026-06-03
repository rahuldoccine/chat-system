import { env, giphyMissingKeyMessage } from '../../../config/env';

export { isGifPickerConfigured } from '../../../config/env';

export type GifResult = {
  id: string;
  title: string;
  /** Best-quality URL used when uploading to our server */
  url: string;
  /** Smaller URL for the picker grid */
  previewUrl: string;
  width: number;
  height: number;
};

type GiphyImage = {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
  /** File size in bytes (string from API) */
  size?: string;
};

type GiphyItem = {
  id: string;
  title: string;
  images: {
    original?: GiphyImage;
    downsized_large?: GiphyImage;
    downsized_medium?: GiphyImage;
    downsized?: GiphyImage;
    fixed_height?: GiphyImage;
    fixed_height_small?: GiphyImage;
    preview_gif?: GiphyImage;
  };
};

type GiphyByIdResponse = { data?: GiphyItem };

function requireApiKey(): string {
  if (!env.giphyApiKey) {
    throw new Error(giphyMissingKeyMessage);
  }
  return env.giphyApiKey;
}

function gifUrl(img: GiphyImage | undefined): string | undefined {
  if (!img) return undefined;
  return img.url ?? img.webp;
}

function imageBytes(img: GiphyImage | undefined): number {
  const n = Number(img?.size ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pickHdDownloadImage(item: GiphyItem): GiphyImage | undefined {
  const original = item.images.original;
  const large = item.images.downsized_large;
  const medium = item.images.downsized_medium;
  const maxBytes = env.giphyMaxDownloadBytes;
  if (original && gifUrl(original)) {
    const bytes = imageBytes(original);
    if (!bytes || bytes <= maxBytes) return original;
  }
  if (large && gifUrl(large)) return large;
  if (original && gifUrl(original)) return original;
  return medium ?? item.images.downsized ?? item.images.fixed_height;
}

function pickBalancedDownloadImage(item: GiphyItem): GiphyImage | undefined {
  const large = item.images.downsized_large;
  const original = item.images.original;
  const medium = item.images.downsized_medium;
  if (large && gifUrl(large)) return large;
  if (original && gifUrl(original)) return original;
  return medium ?? item.images.downsized ?? item.images.fixed_height;
}

function pickCompactDownloadImage(item: GiphyItem): GiphyImage | undefined {
  const medium = item.images.downsized_medium;
  return (
    medium ??
    item.images.downsized ??
    item.images.fixed_height ??
    item.images.fixed_height_small ??
    item.images.preview_gif
  );
}

/** Pick the highest-quality GIF URL we can upload (respects size cap). */
function pickDownloadImage(item: GiphyItem): GiphyImage | undefined {
  if (env.giphyDownloadQuality === 'hd') return pickHdDownloadImage(item);
  if (env.giphyDownloadQuality === 'balanced') return pickBalancedDownloadImage(item);
  return pickCompactDownloadImage(item);
}

function pickPreviewImage(item: GiphyItem): GiphyImage | undefined {
  return (
    item.images.fixed_height ??
    item.images.downsized_medium ??
    item.images.fixed_height_small ??
    item.images.preview_gif ??
    pickDownloadImage(item)
  );
}

function mapGif(item: GiphyItem): GifResult | null {
  const download = pickDownloadImage(item);
  const downloadUrl = gifUrl(download);
  if (!downloadUrl) return null;

  const preview = pickPreviewImage(item);

  return {
    id: item.id,
    title: item.title || 'GIF',
    url: downloadUrl,
    previewUrl: gifUrl(preview) ?? downloadUrl,
    width: Number(download?.width) || 480,
    height: Number(download?.height) || 480,
  };
}

async function fetchGifs(path: string, params: Record<string, string>): Promise<GifResult[]> {
  const apiKey = requireApiKey();
  const query = new URLSearchParams({
    api_key: apiKey,
    limit: String(env.giphySearchLimit),
    rating: 'pg',
    ...params,
  });
  const res = await fetch(`${env.giphyApiBase}${path}?${query}`);
  if (!res.ok) {
    throw new Error("GIFs couldn't be loaded. Please try again in a moment.");
  }
  const json = (await res.json()) as { data?: GiphyItem[] };
  return (json.data ?? []).map(mapGif).filter((g): g is GifResult => g !== null);
}

/** Re-fetch a GIF by id so we get full `original` URLs (search results can be lighter). */
export async function fetchGifById(id: string): Promise<GifResult | null> {
  const apiKey = requireApiKey();
  const res = await fetch(`${env.giphyApiBase}/${encodeURIComponent(id)}?api_key=${apiKey}`);
  if (!res.ok) return null;
  const json = (await res.json()) as GiphyByIdResponse;
  if (!json.data) return null;
  return mapGif(json.data);
}

export function fetchTrendingGifs(): Promise<GifResult[]> {
  return fetchGifs('/trending', {});
}

export function searchGifs(term: string): Promise<GifResult[]> {
  const q = term.trim();
  if (!q) return fetchTrendingGifs();
  return fetchGifs('/search', { q });
}

/** Resolve best download URL (HD) then fetch bytes for upload. */
export async function gifToFile(gif: GifResult): Promise<File> {
  const hd =
    env.giphyDownloadQuality === 'hd' || env.giphyDownloadQuality === 'balanced'
      ? await fetchGifById(gif.id)
      : null;
  const source = hd ?? gif;
  const res = await fetch(source.url);
  if (!res.ok) throw new Error("This GIF couldn't be downloaded. Please pick another one.");
  const blob = await res.blob();
  const isWebp = source.url.includes('.webp') || blob.type === 'image/webp';
  const ext = isWebp ? 'webp' : 'gif';
  const mime = blob.type || (isWebp ? 'image/webp' : 'image/gif');
  const safeName = `${source.id}.${ext}`;
  return new File([blob], safeName, { type: mime });
}
