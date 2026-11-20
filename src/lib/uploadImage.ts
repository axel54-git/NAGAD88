function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}

async function decodeImageDimensions(
  file: File
): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close()
      };
    } catch {
      // Fall through to Image + ObjectURL
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Invalid image file'));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl)
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

/**
 * Compresses any image File down to a lightweight binary JPEG Blob (~40-90 KB)
 * BEFORE uploading, so even slow mobile networks upload in ~1 second.
 */
export async function compressImageToBlob(
  file: File,
  maxDimension = 960,
  quality = 0.72
): Promise<Blob> {
  if (file.size > 0 && file.size <= 90 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/webp')) {
    return file;
  }

  const decoded = await decodeImageDimensions(file);
  try {
    const maxSide = Math.max(decoded.width, decoded.height, 1);
    const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    decoded.draw(ctx, width, height);

    const blob = await canvasToJpegBlob(canvas, quality);
    return blob && blob.size > 0 ? blob : file;
  } finally {
    decoded.cleanup();
  }
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 960,
  quality = 0.72
): Promise<string> {
  const blob = await compressImageToBlob(file, maxDimension, quality);
  return blobToDataUrl(blob);
}

/**
 * Compresses image first to ~40-90 KB JPEG, then uploads via server-side proxy
 * (/api/upload-image) so ImgBB API key is never exposed in client code.
 */
export async function uploadProofImage(file: File, _imgbbApiKey?: string): Promise<string> {
  let compressedBlob: Blob;
  try {
    compressedBlob = await compressImageToBlob(file, 960, 0.72);
  } catch {
    compressedBlob = file;
  }

  const dataUrl = await blobToDataUrl(compressedBlob);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const uTok = localStorage.getItem('c2c_user_token');
      const aTok = localStorage.getItem('c2c_admin_token');
      if (uTok) headers['x-user-token'] = uTok;
      if (aTok) headers['x-admin-token'] = aTok;
    } catch {}
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageBase64: dataUrl }),
      signal: controller.signal
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      if (json?.ok && json?.url) {
        return json.url;
      }
    }
  } catch {
    // Fallback to compressed DataURL if upload proxy times out
  } finally {
    clearTimeout(timer);
  }

  return dataUrl;
}
