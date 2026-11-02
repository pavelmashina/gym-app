/**
 * Mirrors existing Unsplash IDs as GitHub Pages JPG assets.
 * Production recipe, meal-plan, and meal-step images are served from the
 * repository rather than requiring access to images.unsplash.com on clients.
 */
export const MIRRORED_NUTRITION_PHOTOS = new Set([
  "1525351484163-7529414344d8",
  "1547592180-85f173990554",
  "1490645935967-10de6ba17061",
  "1510693206972-df098062cb71",
  "1488477181946-6428a0291777",
  "1467003909585-2f8a72700288",
  "1517673400267-0251440c45dc",
  "1604908176997-125f25cc6f3d",
  "1571212515416-fca77afa66ee",
  "1519708227418-c8fd9a32b7a2",
  "1517673132405-a56a62b18caf",
  "1551183053-bf91a1d81141",
  "1493770348161-369560ae357d",
  "1544025162-d76694265947",
  "1498837167922-ddd27525d352",
  "1543353071-10c8ba85a904"
]);

export function nutritionImageSrc(url, base = import.meta.env?.BASE_URL || '/') {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/^https:\/\/images\.unsplash\.com\/photo-(\d{13}-[a-f0-9]{12})(?:[?#]|$)/i);
  if (!match || !MIRRORED_NUTRITION_PHOTOS.has(match[1])) return url;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}assets/nutrition/photos/photo-${match[1]}.jpg`;
}
