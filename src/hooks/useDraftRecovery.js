import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  areDraftsEquivalent,
  cleanupOldAutosaveDrafts,
  clearAutosaveDraft,
  compareDraftFreshness,
  loadAutosaveDraft,
} from '@/lib/autosaveStorage';

const INITIAL_STATE = {
  draft: null,
  shouldPrompt: false,
  resolved: false,
};

export function useDraftRecovery({
  module,
  userId,
  recordId,
  remoteUpdatedAt,
  baselineSnapshot = null,
  enabled = true,
  isMeaningfulDraft,
}) {
  const scope = useMemo(() => ({
    module,
    userId,
    recordId: recordId || 'new',
  }), [module, recordId, userId]);
  const mountedAtRef = useRef(Date.now());
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    if (!enabled || !module || !userId) {
      setState({ ...INITIAL_STATE, resolved: true });
      return;
    }

    cleanupOldAutosaveDrafts();

    const draft = loadAutosaveDraft(scope);
    if (!draft?.payload) {
      setState({ ...INITIAL_STATE, resolved: true });
      return;
    }

    const isTransientQuickCreate = `${module || ''}`.includes('quick_create');
    if (isTransientQuickCreate) {
      clearAutosaveDraft(scope);
      setState({ ...INITIAL_STATE, resolved: true });
      return;
    }

    if (typeof isMeaningfulDraft === 'function' && !isMeaningfulDraft(draft.payload)) {
      clearAutosaveDraft(scope);
      setState({ ...INITIAL_STATE, resolved: true });
      return;
    }

    if (baselineSnapshot && areDraftsEquivalent(draft.payload, baselineSnapshot)) {
      setState({ ...INITIAL_STATE, resolved: true });
      return;
    }

    const freshness = compareDraftFreshness({
      localSavedAt: draft.local_saved_at,
      remoteUpdatedAt,
    });

    if (!['local-only', 'local-newer'].includes(freshness)) {
      setState({ ...INITIAL_STATE, resolved: true });
      return;
    }

    const localSavedTime = new Date(draft.local_saved_at || '').getTime();
    if (Number.isFinite(localSavedTime) && localSavedTime >= mountedAtRef.current) {
      setState({ ...INITIAL_STATE, resolved: true });
      return;
    }

    setState({
      draft,
      shouldPrompt: true,
      resolved: false,
    });
  }, [baselineSnapshot, enabled, isMeaningfulDraft, module, remoteUpdatedAt, scope, userId]);

  const recoverDraft = useCallback(() => {
    if (!state.draft?.payload) {
      setState({ ...INITIAL_STATE, resolved: true });
      return null;
    }

    setState((prev) => ({
      ...prev,
      shouldPrompt: false,
      resolved: true,
    }));

    return state.draft.payload;
  }, [state.draft]);

  const discardDraft = useCallback(() => {
    clearAutosaveDraft(scope);
    setState({ ...INITIAL_STATE, resolved: true });
  }, [scope]);

  return {
    draft: state.draft,
    draftSavedAt: state.draft?.local_saved_at || null,
    shouldPrompt: state.shouldPrompt,
    resolved: state.resolved,
    recoverDraft,
    discardDraft,
  };
}
