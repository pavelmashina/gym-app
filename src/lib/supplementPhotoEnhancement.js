/**
 * Fill the missing parts of a 230px-high supplement hero using pixels from
 * the *same* source image. The original aspect ratio and central subject are
 * never cropped. Edge-strip extrapolation gives the composition continuous
 * left/right (or top/bottom) imagery without cloning another product.
 *
 * Rendering happens at up to 2x device resolution with a light unsharp mask.
 * This is deterministic, local image processing rather than AI hallucination;
 * native detail cannot be recovered from a 128x128 original.
 */

export function containRect(imageWidth, imageHeight, width, height) {
  if (![imageWidth, imageHeight, width, height].every((n) => Number.isFinite(n) && n > 0)) return null;
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const w = imageWidth * scale;
  const h = imageHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

function sharpenRegion(context, x, y, width, height) {
  if (width < 4 || height < 4) return;
  try {
    const image = context.getImageData(x, y, width, height);
    const src = image.data;
    const output = new Uint8ClampedArray(src);
    // Gentle unsharp mask; sharpen boundaries only, do not amplify JPEG noise.
    for (let row = 1; row < height - 1; row++) {
      for (let col = 1; col < width - 1; col++) {
        const base = (row * width + col) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const value = src[base + channel];
          const neighbor = (src[base + channel - width * 4] + src[base + channel + width * 4]
            + src[base + channel - 4] + src[base + channel + 4]) / 4;
          output[base + channel] = Math.max(0, Math.min(255, value + .52 * (value - neighbor)));
        }
      }
    }
    image.data.set(output);
    context.putImageData(image, x, y);
  } catch {
    // Third-party images without CORS access remain visible and unmodified.
  }
}

export function paintSupplementPhoto({ canvas, image, width, height, pixelRatio }) {
  const sw = image?.naturalWidth || 0;
  const sh = image?.naturalHeight || 0;
  const rect = containRect(sw, sh, width, height);
  if (!canvas || !rect) return false;

  const ratio = Math.min(2, Math.max(1, pixelRatio ?? (typeof window === 'undefined' ? 2 : window.devicePixelRatio || 1)));
  const cw = Math.max(1, Math.round(width * ratio));
  const ch = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.clearRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#f0efec';
  ctx.fillRect(0, 0, cw, ch);

  const fx = Math.round(rect.x * ratio);
  const fy = Math.round(rect.y * ratio);
  const fw = Math.round(rect.width * ratio);
  const fh = Math.round(rect.height * ratio);
  const blur = Math.max(3, Math.round(7 * ratio));

  // Extend texture at the very edges, not the jar in the middle.
  if (fx > 0) {
    const strip = Math.max(1, Math.round(sw * .045));
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(image, 0, 0, strip, sh, -blur, fy, fx + blur * 2, fh);
    ctx.drawImage(image, sw - strip, 0, strip, sh, fx + fw - blur, fy, cw - fx - fw + blur * 2, fh);
    ctx.restore();
  }
  if (fy > 0) {
    const strip = Math.max(1, Math.round(sh * .045));
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(image, 0, 0, sw, strip, fx, -blur, fw, fy + blur * 2);
    ctx.drawImage(image, 0, sh - strip, sw, strip, fx, fy + fh - blur, fw, ch - fy - fh + blur * 2);
    ctx.restore();
  }

  // The original photo touches at least one pair of block edges.
  ctx.filter = 'none';
  ctx.drawImage(image, fx, fy, fw, fh);
  sharpenRegion(ctx, fx, fy, fw, fh);
  return true;
}
