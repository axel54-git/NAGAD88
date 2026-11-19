const PINNED_IMAGE_MAP = new Map<string, HTMLImageElement>();

export function preloadPermanentImages(urls: Array<string | null | undefined>): void {
  if (typeof window === 'undefined') return;

  for (const raw of urls) {
    const src = typeof raw === 'string' ? raw.trim() : '';
    if (!src || PINNED_IMAGE_MAP.has(src)) continue;

    const img = new Image();
    img.decoding = 'sync';
    img.loading = 'eager';
    if (src.startsWith('http') && !src.startsWith(window.location.origin)) {
      img.referrerPolicy = 'no-referrer';
    }
    img.src = src;
    PINNED_IMAGE_MAP.set(src, img);
  }
}
