import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  areDocumentDraftsEquivalent,
  cleanupOldDocumentDrafts,
  clearDocumentDraft,
  loadDocumentDraft,
  saveDocumentDraft,
} from '@/lib/documentDraftStorage';

const INITIAL_RECOVERY_STATE = {
  draft: null,
  shouldPrompt: false,
  resolved: false,
};

function isLocalDraftNewerThanRemote(localSavedAt, remoteUpdatedAt) {
  if (!remoteUpdatedAt) return true;

  const localTime = new Date(localSavedAt || '').getTime();
  const remoteTime = new Date(remoteUpdatedAt || '').getTime();

  if (!Number.isFinite(localTime)) return false;
  if (!Number.isFinite(remoteTime)) return true;

  return localTime > remoteTime;
}

export function useDocumentDraftAutosave({
  documentType,
  userId,
  brandProfileId,
  recordId = 'new',
  data,
  serialize,
  normalizeDraft,
  baselineSnapshot = null,
  remoteUpdatedAt = null,
  enabled = true,
  autosaveEnabled = enabled,
  delay = 1200,
  isMeaningfulDraft,
}) {
  const scope = useMemo(() => ({
    userId,
    documentType,
    brandProfileId: brandProfileId || 'no-brand',
    recordId: recordId || 'new',
  }), [brandProfileId, documentType, recordId, userId]);

  const latestDataRef = useRef(data);
  const timerRef = useRef(null);
  const lastFingerprintRef = useRef(null);
  const mountedAtRef = useRef(Date.now());
  const saveNowRef = useRef(null);
  const [recoveryState, setRecoveryState] = useState(INITIAL_RECOVERY_STATE);
  const [status, setStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const buildPayload = useCallback(() => {
    const payload = typeof serialize === 'function'
      ? serialize(latestDataRef.current)
      : latestDataRef.current;
    return {
      payload,
      fingerprint: JSON.stringify(payload ?? null),
    };
  }, [serialize]);

  const saveNow = useCallback(() => {
    if (!enabled || !autosaveEnabled || !userId || !documentType) return null;

    const { payload, fingerprint } = buildPayload();
    if (baselineSnapshot && areDocumentDraftsEquivalent(payload, baselineSnapshot)) {
      clearDocumentDraft(scope);
      lastFingerprintRef.current = null;
      setStatus('idle');
      setLastSavedAt(null);
      return null;
    }

    if (typeof isMeaningfulDraft === 'function' && !isMeaningfulDraft(payload)) {
      clearDocumentDraft(scope);
      lastFingerprintRef.current = null;
      setStatus('idle');
      setLastSavedAt(null);
      return null;
    }

    if (fingerprint === lastFingerprintRef.current) {
      setStatus('saved');
      return null;
    }

    try {
      const draft = saveDocumentDraft(scope, payload);
      lastFingerprintRef.current = fingerprint;
      setLastSavedAt(draft?.local_saved_at || null);
      setLastError(null);
      setStatus('saved');
      return draft;
    } catch (error) {
      setLastError(error);
      setStatus('error');
      return null;
    }
  }, [autosaveEnabled, baselineSnapshot, buildPayload, documentType, enabled, isMeaningfulDraft, scope, userId]);

  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  useEffect(() => {
    cleanupOldDocumentDrafts();
  }, []);

  useEffect(() => {
    clearTimer();
    lastFingerprintRef.current = null;
    setStatus('idle');
    setLastSavedAt(null);
    setLastError(null);

    if (!enabled || !userId || !documentType) {
      setRecoveryState({ ...INITIAL_RECOVERY_STATE, resolved: true });
      return;
    }

    const draft = loadDocumentDraft(scope);
    if (!draft?.payload) {
      setRecoveryState({ ...INITIAL_RECOVERY_STATE, resolved: true });
      return;
    }

    const normalizedPayload = typeof normalizeDraft === 'function'
      ? normalizeDraft(draft.payload)
      : draft.payload;
    const normalizedDraft = {
      ...draft,
      payload: normalizedPayload,
    };

    if (baselineSnapshot && areDocumentDraftsEquivalent(normalizedPayload, baselineSnapshot)) {
      clearDocumentDraft(scope);
      setRecoveryState({ ...INITIAL_RECOVERY_STATE, resolved: true });
      return;
    }

    if (typeof isMeaningfulDraft === 'function' && !isMeaningfulDraft(normalizedPayload)) {
      clearDocumentDraft(scope);
      setRecoveryState({ ...INITIAL_RECOVERY_STATE, resolved: true });
      return;
    }

    if (!isLocalDraftNewerThanRemote(normalizedDraft.local_saved_at, remoteUpdatedAt)) {
      clearDocumentDraft(scope);
      setRecoveryState({ ...INITIAL_RECOVERY_STATE, resolved: true });
      return;
    }

    const localSavedTime = new Date(normalizedDraft.local_saved_at || '').getTime();
    if (Number.isFinite(localSavedTime) && localSavedTime >= mountedAtRef.current) {
      setRecoveryState({ ...INITIAL_RECOVERY_STATE, resolved: true });
      return;
    }

    setRecoveryState({
      draft: normalizedDraft,
      shouldPrompt: true,
      resolved: false,
    });
  }, [
    baselineSnapshot,
    clearTimer,
    documentType,
    enabled,
    isMeaningfulDraft,
    normalizeDraft,
    remoteUpdatedAt,
    scope,
    userId,
  ]);

  useEffect(() => {
    if (!enabled || !autosaveEnabled || !recoveryState.resolved || !userId || !documentType) return undefined;

    setStatus((currentStatus) => (currentStatus === 'saving' ? currentStatus : 'pending'));
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      saveNow();
    }, delay);
  }, [
    clearTimer,
    autosaveEnabled,
    data,
    delay,
    documentType,
    enabled,
    recoveryState.resolved,
    saveNow,
    userId,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled || !autosaveEnabled || !recoveryState.resolved) return undefined;

    const flushPendingDraft = () => {
      if (!timerRef.current) return;
      clearTimer();
      saveNow();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingDraft();
      }
    };

    window.addEventListener('pagehide', flushPendingDraft);
    window.addEventListener('beforeunload', flushPendingDraft);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushPendingDraft);
      window.removeEventListener('beforeunload', flushPendingDraft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autosaveEnabled, clearTimer, enabled, recoveryState.resolved, saveNow]);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimer();
      saveNowRef.current?.();
    }
  }, [clearTimer]);

  const flushLocalDraft = useCallback(() => {
    clearTimer();
    return saveNow();
  }, [clearTimer, saveNow]);

  const cancelPending = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const clearDraft = useCallback(() => {
    clearTimer();
    clearDocumentDraft(scope);
    lastFingerprintRef.current = null;
    setStatus('idle');
    setLastSavedAt(null);
    setLastError(null);
  }, [clearTimer, scope]);

  const recoverDraft = useCallback(() => {
    if (!recoveryState.draft?.payload) {
      setRecoveryState({ ...INITIAL_RECOVERY_STATE, resolved: true });
      return null;
    }

    setRecoveryState((prev) => ({
      ...prev,
      shouldPrompt: false,
      resolved: true,
    }));

    return recoveryState.draft.payload;
  }, [recoveryState.draft]);

  const discardDraft = useCallback(() => {
    clearDraft();
    setRecoveryState({ ...INITIAL_RECOVERY_STATE, resolved: true });
  }, [clearDraft]);

  return {
    status,
    lastSavedAt,
    lastError,
    draft: recoveryState.draft,
    draftSavedAt: recoveryState.draft?.local_saved_at || null,
    shouldPrompt: recoveryState.shouldPrompt,
    resolved: recoveryState.resolved,
    flushLocalDraft,
    cancelPending,
    clearDraft,
    recoverDraft,
    discardDraft,
  };
}
