const DOCUMENT_DRAFT_STORAGE_PREFIX = 'ceo_document_draft';
const DEFAULT_DOCUMENT_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DOCUMENT_DRAFT_STORAGE_EVENT = 'ceo-document-drafts-changed';
const DEFAULT_ITEMS = [{ description: '', unit_price: 0, quantity: 1, total: 0 }];

function getStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function sanitizeKeyPart(value, fallback = 'none') {
  const normalized = `${value ?? fallback}`.trim();
  return (normalized || fallback).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isExpiredDraft(draft, maxAgeMs = DEFAULT_DOCUMENT_DRAFT_MAX_AGE_MS) {
  if (!draft?.local_saved_at) return true;
  const savedAt = new Date(draft.local_saved_at).getTime();
  if (!Number.isFinite(savedAt)) return true;
  return Date.now() - savedAt > maxAgeMs;
}

function emitDraftStorageChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DOCUMENT_DRAFT_STORAGE_EVENT));
}

export function buildDocumentDraftKey({
  userId,
  documentType,
  brandProfileId = 'no-brand',
  recordId = 'new',
}) {
  return [
    DOCUMENT_DRAFT_STORAGE_PREFIX,
    sanitizeKeyPart(userId, 'anon'),
    sanitizeKeyPart(documentType, 'document'),
    sanitizeKeyPart(brandProfileId, 'no-brand'),
    sanitizeKeyPart(recordId, 'new'),
  ].join('_');
}

export function cleanupOldDocumentDrafts(maxAgeMs = DEFAULT_DOCUMENT_DRAFT_MAX_AGE_MS) {
  const storage = getStorage();
  if (!storage) return;

  const keysToDelete = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`${DOCUMENT_DRAFT_STORAGE_PREFIX}_`)) continue;

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
  if (keysToDelete.length > 0) {
    emitDraftStorageChange();
  }
}

export function normalizeDocumentDraftPayload(raw = {}) {
  return {
    ...(Object.prototype.hasOwnProperty.call(raw, 'invoice_number') ? { invoice_number: raw?.invoice_number || '' } : {}),
    ...(Object.prototype.hasOwnProperty.call(raw, 'quote_number') ? { quote_number: raw?.quote_number || '' } : {}),
    date: raw?.date || '',
    due_date: raw?.due_date || '',
    status: raw?.status || 'pending',
    client_id: raw?.client_id || '',
    client_name: raw?.client_name || '',
    client_email: raw?.client_email || '',
    client_phone: raw?.client_phone || '',
    tax_enabled: Boolean(raw?.tax_enabled),
    tax_pct: raw?.tax_pct ?? 18,
    notes: raw?.notes || '',
    line_items: Array.isArray(raw?.line_items) && raw.line_items.length > 0
      ? raw.line_items
      : [...DEFAULT_ITEMS],
    additional_charges: Array.isArray(raw?.additional_charges) ? raw.additional_charges : [],
    visual_attachments: Array.isArray(raw?.visual_attachments) ? raw.visual_attachments : [],
    commercial_attachments_layout: raw?.commercial_attachments_layout || '',
  };
}

export function saveDocumentDraft(scope, payload, metadata = {}) {
  const storage = getStorage();
  if (!storage) return null;

  cleanupOldDocumentDrafts();

  const draft = {
    version: 1,
    document_type: sanitizeKeyPart(scope?.documentType, 'document'),
    user_id: sanitizeKeyPart(scope?.userId, 'anon'),
    brand_profile_id: sanitizeKeyPart(scope?.brandProfileId, 'no-brand'),
    record_id: sanitizeKeyPart(scope?.recordId, 'new'),
    local_saved_at: metadata.localSavedAt || new Date().toISOString(),
    payload,
  };

  storage.setItem(buildDocumentDraftKey(scope), JSON.stringify(draft));
  emitDraftStorageChange();
  return draft;
}

export function loadDocumentDraft(scope) {
  const storage = getStorage();
  if (!storage) return null;

  const key = buildDocumentDraftKey(scope);

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

export function clearDocumentDraft(scope) {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(buildDocumentDraftKey(scope));
  emitDraftStorageChange();
}

export function listDocumentDrafts({ userId, brandProfileId = 'no-brand', recordId = 'new' } = {}) {
  const storage = getStorage();
  if (!storage || !userId) return [];

  cleanupOldDocumentDrafts();

  const drafts = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`${DOCUMENT_DRAFT_STORAGE_PREFIX}_`)) continue;

    try {
      const raw = storage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (isExpiredDraft(parsed)) {
        storage.removeItem(key);
        continue;
      }

      if (parsed.user_id !== sanitizeKeyPart(userId, 'anon')) continue;
      if (parsed.brand_profile_id !== sanitizeKeyPart(brandProfileId, 'no-brand')) continue;
      if (parsed.record_id !== sanitizeKeyPart(recordId, 'new')) continue;

      drafts.push({
        ...parsed,
        payload: normalizeDocumentDraftPayload(parsed.payload || {}),
        scope: {
          userId,
          documentType: parsed.document_type,
          brandProfileId,
          recordId,
        },
      });
    } catch {
      storage.removeItem(key);
    }
  }

  return drafts.sort((left, right) => `${right.local_saved_at || ''}`.localeCompare(`${left.local_saved_at || ''}`));
}

export function areDocumentDraftsEquivalent(left, right) {
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch {
    return false;
  }
}
