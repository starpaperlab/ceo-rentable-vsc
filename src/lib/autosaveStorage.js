const AUTOSAVE_STORAGE_PREFIX = 'ceo_autosave';
const DEFAULT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function getStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function sanitizeKeyPart(value, fallback = 'new') {
  const normalized = `${value ?? fallback}`.trim();
  return (normalized || fallback).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isExpiredDraft(draft, maxAgeMs = DEFAULT_DRAFT_MAX_AGE_MS) {
  if (!draft?.local_saved_at) return true;
  const savedAt = new Date(draft.local_saved_at).getTime();
  if (!Number.isFinite(savedAt)) return true;
  return Date.now() - savedAt > maxAgeMs;
}

export function buildAutosaveKey({ module, userId, recordId = 'new' }) {
  return [
    AUTOSAVE_STORAGE_PREFIX,
    sanitizeKeyPart(module, 'module'),
    sanitizeKeyPart(userId, 'anon'),
    sanitizeKeyPart(recordId, 'new'),
  ].join('_');
}

export function cleanupOldAutosaveDrafts(maxAgeMs = DEFAULT_DRAFT_MAX_AGE_MS) {
  const storage = getStorage();
  if (!storage) return;

  const keysToDelete = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`${AUTOSAVE_STORAGE_PREFIX}_`)) continue;

    try {
      const raw = storage.getItem(key);
      if (!raw) {
        keysToDelete.push(key);
        continue;
      }

      const parsed = JSON.parse(raw);
      if (isExpiredDraft(parsed, maxAgeMs)) {
        keysToDelete.push(key);
      }
    } catch {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => storage.removeItem(key));
}

export function saveAutosaveDraft(scope, payload, metadata = {}) {
  const storage = getStorage();
  if (!storage) return null;

  cleanupOldAutosaveDrafts();

  const key = buildAutosaveKey(scope);
  const draft = {
    version: 1,
    module: sanitizeKeyPart(scope?.module, 'module'),
    user_id: sanitizeKeyPart(scope?.userId, 'anon'),
    record_id: sanitizeKeyPart(scope?.recordId, 'new'),
    local_saved_at: metadata.localSavedAt || new Date().toISOString(),
    remote_updated_at: metadata.remoteUpdatedAt || null,
    payload,
  };

  storage.setItem(key, JSON.stringify(draft));
  return draft;
}

export function loadAutosaveDraft(scope) {
  const storage = getStorage();
  if (!storage) return null;

  const key = buildAutosaveKey(scope);

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (isExpiredDraft(parsed)) {
      storage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function clearAutosaveDraft(scope) {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(buildAutosaveKey(scope));
}

export function compareDraftFreshness({ localSavedAt, remoteUpdatedAt }) {
  if (!localSavedAt && !remoteUpdatedAt) return 'equal';
  if (localSavedAt && !remoteUpdatedAt) return 'local-only';
  if (!localSavedAt && remoteUpdatedAt) return 'remote-only';

  const localTime = new Date(localSavedAt).getTime();
  const remoteTime = new Date(remoteUpdatedAt).getTime();

  if (!Number.isFinite(localTime) || !Number.isFinite(remoteTime)) return 'equal';
  if (localTime > remoteTime) return 'local-newer';
  if (localTime < remoteTime) return 'remote-newer';
  return 'equal';
}

export function areDraftsEquivalent(left, right) {
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch {
    return false;
  }
}

