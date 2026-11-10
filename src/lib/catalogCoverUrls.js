/**
 * Catalog artwork is a versioned static app asset, not a user-uploaded
 * Supabase Storage object. Adopted copies retain source_catalog_program_id.
 */
export function catalogCoverUrls(sourcePayload, baseUrl = '/') {
  const validImageName = name => typeof name === 'string'
    && /^[a-z0-9][a-z0-9._-]*\.(?:webp|png|jpg)$/i.test(name);
  const assetUrl = imageName => validImageName(imageName) ? baseUrl + 'assets/' + imageName : null;
  const coverUrl = assetUrl(sourcePayload?.cover_image);
  return {
    coverUrl,
    coverDetailUrl: assetUrl(sourcePayload?.cover_image_detail) || coverUrl,
  };
}

/** A user-chosen cover always takes precedence over the catalog template. */
export function preferProgramCover(signedCoverUrl, catalogCoverUrl) {
  return signedCoverUrl || catalogCoverUrl || null;
}
