import { supabase } from './supabase.js';

const MEASUREMENTS_KEY = 'gym-statistics-measurements-v1';
const PHOTOS_KEY = 'gym-statistics-photos-v1';
const FAVORITES_KEY = 'gym-statistics-favorites-v1';

const LOCAL_POLL_MS = 400;
const REMOTE_POLL_MS = 5000;

function readArray(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function stable(value) {
  return JSON.stringify(value);
}

function normalizeMeasurements(items) {
  return (items || []).map((item) => ({
    ...item,
    id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    thighs: item.thighs ?? item.hips ?? null,
    arm: item.arm ?? item.biceps ?? null,
  })).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)));
}

function normalizePhotos(items) {
  return (items || []).map((item) => ({
    ...item,
    id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    angle: item.angle || 'front',
  })).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.angle).localeCompare(String(b.angle)));
}

function normalizeFavorites(items) {
  return [...new Set((items || []).filter(Boolean).map(String))].sort();
}

function photoSignature(items) {
  return stable(normalizePhotos(items).map((item) => ({ date: item.date, angle: item.angle, dataUrl: item.dataUrl })));
}

function measurementFromRow(row) {
  return {
    id: row.client_id,
    date: row.measured_on,
    weight: row.weight == null ? null : Number(row.weight),
    waist: row.waist == null ? null : Number(row.waist),
    chest: row.chest == null ? null : Number(row.chest),
    glutes: row.glutes == null ? null : Number(row.glutes),
    thighs: row.thighs == null ? null : Number(row.thighs),
    arm: row.arm == null ? null : Number(row.arm),
    shoulders: row.shoulders == null ? null : Number(row.shoulders),
    neck: row.neck == null ? null : Number(row.neck),
    calf: row.calf == null ? null : Number(row.calf),
    forearm: row.forearm == null ? null : Number(row.forearm),
  };
}

function photoFromRow(row) {
  return {
    id: row.id,
    date: row.taken_on,
    angle: row.angle,
    dataUrl: row.image_data,
  };
}

async function loadCloud(userId) {
  const [measurementsResult, photosResult, preferencesResult] = await Promise.all([
    supabase.from('user_statistics_measurements')
      .select('id, client_id, measured_on, weight, waist, chest, glutes, thighs, arm, shoulders, neck, calf, forearm')
      .eq('user_id', userId)
      .order('measured_on', { ascending: true }),
    supabase.from('user_statistics_photos')
      .select('id, taken_on, angle, image_data')
      .eq('user_id', userId)
      .order('taken_on', { ascending: false }),
    supabase.from('user_statistics_preferences')
      .select('favorites')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (measurementsResult.error) throw measurementsResult.error;
  if (photosResult.error) throw photosResult.error;
  if (preferencesResult.error) throw preferencesResult.error;

  return {
    measurements: normalizeMeasurements((measurementsResult.data || []).map(measurementFromRow)),
    photos: normalizePhotos((photosResult.data || []).map(photoFromRow)),
    favorites: normalizeFavorites(preferencesResult.data?.favorites || []),
    hasPreferences: Boolean(preferencesResult.data),
  };
}

async function pushMeasurements(userId, items) {
  const normalized = normalizeMeasurements(items);
  const clientIds = normalized.map((item) => item.id);

  const current = await supabase.from('user_statistics_measurements')
    .select('id, client_id')
    .eq('user_id', userId);
  if (current.error) throw current.error;

  const toDelete = (current.data || []).filter((row) => !clientIds.includes(row.client_id)).map((row) => row.id);
  if (toDelete.length) {
    const deleted = await supabase.from('user_statistics_measurements').delete().in('id', toDelete).eq('user_id', userId);
    if (deleted.error) throw deleted.error;
  }

  if (normalized.length) {
    const payload = normalized.map((item) => ({
      user_id: userId,
      client_id: item.id,
      measured_on: item.date,
      weight: item.weight ?? null,
      waist: item.waist ?? null,
      chest: item.chest ?? null,
      glutes: item.glutes ?? null,
      thighs: item.thighs ?? item.hips ?? null,
      arm: item.arm ?? item.biceps ?? null,
      shoulders: item.shoulders ?? null,
      neck: item.neck ?? null,
      calf: item.calf ?? null,
      forearm: item.forearm ?? null,
    }));
    const upserted = await supabase.from('user_statistics_measurements').upsert(payload, { onConflict: 'user_id,client_id' });
    if (upserted.error) throw upserted.error;
  }

  return normalized;
}

async function pushPhotos(userId, items) {
  const normalized = normalizePhotos(items);
  const keys = new Set(normalized.map((item) => `${item.date}|${item.angle}`));

  const current = await supabase.from('user_statistics_photos')
    .select('id, taken_on, angle, image_data')
    .eq('user_id', userId);
  if (current.error) throw current.error;

  const staleIds = (current.data || [])
    .filter((row) => !keys.has(`${row.taken_on}|${row.angle}`))
    .map((row) => row.id);
  if (staleIds.length) {
    const deleted = await supabase.from('user_statistics_photos').delete().in('id', staleIds).eq('user_id', userId);
    if (deleted.error) throw deleted.error;
  }

  const currentByKey = new Map((current.data || []).map((row) => [`${row.taken_on}|${row.angle}`, row]));
  const changed = normalized.filter((item) => currentByKey.get(`${item.date}|${item.angle}`)?.image_data !== item.dataUrl);
  if (changed.length) {
    const payload = changed.map((item) => ({
      user_id: userId,
      taken_on: item.date,
      angle: item.angle,
      image_data: item.dataUrl,
    }));
    const upserted = await supabase.from('user_statistics_photos').upsert(payload, { onConflict: 'user_id,taken_on,angle' });
    if (upserted.error) throw upserted.error;
  }

  return normalized;
}

async function pushFavorites(userId, favorites) {
  const normalized = normalizeFavorites(favorites);
  const result = await supabase.from('user_statistics_preferences').upsert({
    user_id: userId,
    favorites: normalized,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (result.error) throw result.error;
  return normalized;
}

function localState() {
  return {
    measurements: normalizeMeasurements(readArray(MEASUREMENTS_KEY)),
    photos: normalizePhotos(readArray(PHOTOS_KEY)),
    favorites: normalizeFavorites(readArray(FAVORITES_KEY)),
  };
}

function writeLocalState(state) {
  writeArray(MEASUREMENTS_KEY, state.measurements);
  writeArray(PHOTOS_KEY, state.photos);
  writeArray(FAVORITES_KEY, state.favorites);
}

function mergeInitialMeasurements(cloudItems, localItems) {
  const merged = new Map(normalizeMeasurements(cloudItems).map((item) => [item.id, item]));
  normalizeMeasurements(localItems).forEach((item) => {
    if (!merged.has(item.id)) merged.set(item.id, item);
  });
  return normalizeMeasurements([...merged.values()]);
}

function mergeInitialPhotos(cloudItems, localItems) {
  const merged = new Map(normalizePhotos(cloudItems).map((item) => [`${item.date}|${item.angle}`, item]));
  normalizePhotos(localItems).forEach((item) => {
    const key = `${item.date}|${item.angle}`;
    if (!merged.has(key)) merged.set(key, item);
  });
  return normalizePhotos([...merged.values()]);
}

export async function initializeStatisticsCloudSync({ onRemoteUpdate } = {}) {
  if (!supabase) return () => {};

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = session?.user?.id;
  if (!userId) return () => {};

  let stopped = false;
  let syncing = false;
  let localTimer;
  let remoteTimer;

  const local = localState();
  const cloud = await loadCloud(userId);

  const merged = {
    measurements: mergeInitialMeasurements(cloud.measurements, local.measurements),
    photos: mergeInitialPhotos(cloud.photos, local.photos),
    favorites: cloud.hasPreferences ? cloud.favorites : local.favorites,
  };

  if (stable(merged.measurements) !== stable(cloud.measurements)) await pushMeasurements(userId, merged.measurements);
  if (photoSignature(merged.photos) !== photoSignature(cloud.photos)) await pushPhotos(userId, merged.photos);
  if (!cloud.hasPreferences) await pushFavorites(userId, local.favorites);

  writeLocalState(merged);

  let snapshots = {
    measurements: stable(merged.measurements),
    photos: photoSignature(merged.photos),
    favorites: stable(merged.favorites),
  };

  async function syncLocalChanges() {
    if (stopped || syncing) return;
    const current = localState();
    const nextSnapshots = {
      measurements: stable(current.measurements),
      photos: photoSignature(current.photos),
      favorites: stable(current.favorites),
    };

    if (nextSnapshots.measurements === snapshots.measurements &&
        nextSnapshots.photos === snapshots.photos &&
        nextSnapshots.favorites === snapshots.favorites) return;

    syncing = true;
    try {
      if (nextSnapshots.measurements !== snapshots.measurements) await pushMeasurements(userId, current.measurements);
      if (nextSnapshots.photos !== snapshots.photos) await pushPhotos(userId, current.photos);
      if (nextSnapshots.favorites !== snapshots.favorites) await pushFavorites(userId, current.favorites);
      snapshots = nextSnapshots;
    } catch (error) {
      console.error('Unable to sync statistics to cloud:', error);
    } finally {
      syncing = false;
    }
  }

  async function pullRemoteChanges() {
    if (stopped || syncing) return;
    syncing = true;
    try {
      const remote = await loadCloud(userId);
      const remoteSnapshots = {
        measurements: stable(remote.measurements),
        photos: photoSignature(remote.photos),
        favorites: stable(remote.favorites),
      };
      const changed = remoteSnapshots.measurements !== snapshots.measurements ||
        remoteSnapshots.photos !== snapshots.photos ||
        remoteSnapshots.favorites !== snapshots.favorites;
      if (!changed) return;

      writeLocalState(remote);
      snapshots = remoteSnapshots;
      onRemoteUpdate?.();
    } catch (error) {
      console.error('Unable to refresh cloud statistics:', error);
    } finally {
      syncing = false;
    }
  }

  localTimer = window.setInterval(syncLocalChanges, LOCAL_POLL_MS);
  remoteTimer = window.setInterval(pullRemoteChanges, REMOTE_POLL_MS);

  return () => {
    window.clearInterval(localTimer);
    window.clearInterval(remoteTimer);
    void syncLocalChanges().finally(() => { stopped = true; });
  };
}
