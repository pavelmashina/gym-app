/**
 * Images do not belong in localStorage (the text-only draft can exceed quota).
 * Keep one cropped File per signed-in user's draft in IndexedDB instead.
 */
const DB_NAME = 'gym-app-program-draft-assets';
const STORE_NAME = 'covers';
const pending = new Map();

function database() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Хранение фото на этом устройстве недоступно.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть хранилище фотографий.'));
  });
}

async function requestCover(key, mode, action) {
  if (!key) return null;
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result = null;
      const request = action(store);
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error('Не удалось сохранить фото.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Сохранение фото прервано.'));
    });
  } finally {
    db.close();
  }
}

// Serialize all writes for a draft to prevent a slow save resurrecting a deleted cover.
function serialize(key, operation) {
  if (!key) return Promise.resolve();
  const previous = pending.get(key) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(operation);
  pending.set(key, result);
  result.finally(() => { if (pending.get(key) === result) pending.delete(key); }).catch(() => {});
  return result;
}

export async function readProgramDraftCover(key) {
  if (!key) return null;
  await (pending.get(key) ?? Promise.resolve()).catch(() => {});
  const data = await requestCover(key, 'readonly', store => store.get(key));
  if (!data?.blob) return null;
  const { blob, name, lastModified } = data;
  return new File([blob], name || 'program-cover.webp', {
    type: blob.type || 'image/webp',
    lastModified: lastModified || Date.now(),
  });
}

export function writeProgramDraftCover(key, file) {
  if (!key) return Promise.resolve();
  return serialize(key, () => requestCover(key, 'readwrite', store => store.put({
    blob: file, name: file.name, lastModified: file.lastModified,
  }, key)));
}

export function clearProgramDraftCover(key) {
  if (!key) return Promise.resolve();
  return serialize(key, () => requestCover(key, 'readwrite', store => store.delete(key)));
}
