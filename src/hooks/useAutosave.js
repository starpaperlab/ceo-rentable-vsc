import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAutosaveQueue } from '@/lib/autosaveQueue';
import {
  cleanupOldAutosaveDrafts,
  clearAutosaveDraft,
  saveAutosaveDraft,
} from '@/lib/autosaveStorage';

function isOfflineLikeError(error) {
  const message = `${error?.message || ''}`.toLowerCase();
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed')
  );
}

export function useAutosave({
  module,
  userId,
  recordId,
  data,
  serialize,
  remoteSave,
  remoteEnabled = true,
  enabled = true,
  paused = false,
  localDelay = 900,
  remoteDelay = 7000,
  remoteUpdatedAt = null,
  onRemoteSaved,
  onRemoteError,
}) {
  const scope = useMemo(() => ({
    module,
    userId,
    recordId: recordId || 'new',
  }), [module, recordId, userId]);
  const queueRef = useRef(null);
  const latestDataRef = useRef(data);
  const localFingerprintRef = useRef(null);
  const remoteFingerprintRef = useRef(null);
  const remoteInFlightRef = useRef(false);
  const remoteReplayRequestedRef = useRef(false);
  const localPendingRef = useRef(false);
  const remotePendingRef = useRef(false);
  const [status, setStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [remoteUpdatedAtState, setRemoteUpdatedAtState] = useState(remoteUpdatedAt);

  if (!queueRef.current && typeof window !== 'undefined') {
    queueRef.current = createAutosaveQueue();
  }

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    setRemoteUpdatedAtState(remoteUpdatedAt || null);
  }, [recordId, remoteUpdatedAt]);

  useEffect(() => {
    cleanupOldAutosaveDrafts();
  }, []);

  useEffect(() => () => {
    queueRef.current?.cancelAll();
  }, []);

  const buildSnapshot = useCallback(() => {
    const payload = serialize(latestDataRef.current);
    return {
      payload,
      fingerprint: JSON.stringify(payload),
    };
  }, [serialize]);

  const persistLocalDraft = useCallback(() => {
    if (!module || !userId || !enabled) return null;

    const { payload, fingerprint } = buildSnapshot();
    if (fingerprint === localFingerprintRef.current) {
      return { payload, fingerprint, skipped: true };
    }

    const draft = saveAutosaveDraft(scope, payload, {
      remoteUpdatedAt: remoteUpdatedAtState,
    });

    localFingerprintRef.current = fingerprint;
    setLastSavedAt(draft?.local_saved_at || null);

    return { payload, fingerprint, skipped: false };
  }, [buildSnapshot, enabled, module, remoteUpdatedAtState, scope, userId]);

  const runRemoteSave = useCallback(async () => {
    if (!remoteEnabled || typeof remoteSave !== 'function') {
      remotePendingRef.current = false;
      setHasPendingChanges(false);
      setStatus('saved');
      return null;
    }

    if (remoteInFlightRef.current) {
      remoteReplayRequestedRef.current = true;
      return null;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      remotePendingRef.current = false;
      setStatus('offline');
      return null;
    }

    remotePendingRef.current = false;

    const localResult = persistLocalDraft();
    const payload = localResult?.payload ?? buildSnapshot().payload;
    const fingerprint = localResult?.fingerprint ?? JSON.stringify(payload);

    if (fingerprint === remoteFingerprintRef.current) {
      setHasPendingChanges(false);
      setStatus('saved');
      return null;
    }

    remoteInFlightRef.current = true;
    setLastError(null);
    setStatus('saving');

    try {
      const result = await remoteSave(payload);
      const nextRemoteUpdatedAt = result?.updated_at || result?.remoteUpdatedAt || result?.data?.updated_at || new Date().toISOString();

      setRemoteUpdatedAtState(nextRemoteUpdatedAt);
      saveAutosaveDraft(scope, payload, {
        remoteUpdatedAt: nextRemoteUpdatedAt,
      });

      localFingerprintRef.current = fingerprint;
      remoteFingerprintRef.current = fingerprint;
      setHasPendingChanges(false);
      setStatus('saved');
      onRemoteSaved?.(result, payload);
      return result;
    } catch (error) {
      setLastError(error);
      setStatus(isOfflineLikeError(error) ? 'offline' : 'error');
      setHasPendingChanges(true);
      onRemoteError?.(error);
      throw error;
    } finally {
      remoteInFlightRef.current = false;

      if (remoteReplayRequestedRef.current) {
        remoteReplayRequestedRef.current = false;
        remotePendingRef.current = true;
        queueRef.current?.schedule('remote', () => runRemoteSave().catch(() => {}), remoteDelay);
      }
    }
  }, [buildSnapshot, onRemoteError, onRemoteSaved, persistLocalDraft, remoteDelay, remoteEnabled, remoteSave, scope]);

  useEffect(() => {
    if (!enabled || paused || !module || !userId || !queueRef.current) return;

    setHasPendingChanges(true);
    setLastError(null);
    setStatus((currentStatus) => (currentStatus === 'saving' ? currentStatus : 'pending'));

    localPendingRef.current = true;
    queueRef.current.schedule('local', () => {
      localPendingRef.current = false;
      persistLocalDraft();

      if (!remoteEnabled || typeof remoteSave !== 'function') {
        setHasPendingChanges(false);
        setStatus('saved');
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('offline');
      }
    }, localDelay);

    if (remoteEnabled && typeof remoteSave === 'function') {
      remotePendingRef.current = true;
      queueRef.current.schedule('remote', () => runRemoteSave().catch(() => {}), remoteDelay);
    }
  }, [
    data,
    enabled,
    localDelay,
    module,
    paused,
    persistLocalDraft,
    remoteDelay,
    remoteEnabled,
    remoteSave,
    runRemoteSave,
    userId,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return undefined;

    const handleBeforeUnload = (event) => {
      const shouldWarn = localPendingRef.current || remotePendingRef.current || remoteInFlightRef.current || hasPendingChanges;
      if (!shouldWarn) return undefined;
      event.preventDefault();
      event.returnValue = 'Tienes cambios sin guardar.';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, hasPendingChanges]);

  const flushLocalDraft = useCallback(() => {
    queueRef.current?.cancel('local');
    localPendingRef.current = false;
    return persistLocalDraft();
  }, [persistLocalDraft]);

  const cancelPending = useCallback(() => {
    queueRef.current?.cancelAll();
    localPendingRef.current = false;
    remotePendingRef.current = false;
  }, []);

  const clearDraft = useCallback(() => {
    clearAutosaveDraft(scope);
    localFingerprintRef.current = null;
    remoteFingerprintRef.current = null;
    localPendingRef.current = false;
    remotePendingRef.current = false;
    setHasPendingChanges(false);
    setLastError(null);
    setStatus('idle');
  }, [scope]);

  const markRemoteSynced = useCallback((payload, options = {}) => {
    const fingerprint = JSON.stringify(payload);
    const nextRemoteUpdatedAt = options.remoteUpdatedAt || new Date().toISOString();

    localFingerprintRef.current = fingerprint;
    remoteFingerprintRef.current = fingerprint;
    localPendingRef.current = false;
    remotePendingRef.current = false;
    setRemoteUpdatedAtState(nextRemoteUpdatedAt);
    setHasPendingChanges(false);
    setLastError(null);
    setStatus('saved');
    setLastSavedAt(nextRemoteUpdatedAt);

    if (options.clearDraftAfterSync) {
      clearAutosaveDraft(scope);
      return;
    }

    saveAutosaveDraft(scope, payload, {
      remoteUpdatedAt: nextRemoteUpdatedAt,
      localSavedAt: nextRemoteUpdatedAt,
    });
  }, [scope]);

  return {
    status,
    lastSavedAt,
    hasPendingChanges,
    lastError,
    remoteUpdatedAt: remoteUpdatedAtState,
    flushLocalDraft,
    cancelPending,
    clearDraft,
    markRemoteSynced,
  };
}
