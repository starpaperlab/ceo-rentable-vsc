import React, { useCallback, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useAutosave } from '@/hooks/useAutosave';
import { useDraftRecovery } from '@/hooks/useDraftRecovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Save } from 'lucide-react';
import { toast } from 'sonner';
import AutosaveStatus from '@/components/shared/AutosaveStatus';
import DraftRecoveryDialog from '@/components/shared/DraftRecoveryDialog';
import { hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership';

function buildQuickProductForm(initialName = '') {
  return {
    name: initialName || '',
    price: '',
    stock: '',
  };
}

function serializeQuickProductForm(raw = {}) {
  return {
    name: `${raw.name || ''}`.trim(),
    price: `${raw.price || ''}`.trim(),
    stock: `${raw.stock || ''}`.trim(),
  };
}

function restoreQuickProductForm(raw, fallbackState) {
  return {
    ...fallbackState,
    ...raw,
    name: raw?.name || '',
    price: raw?.price || '',
    stock: raw?.stock || '',
  };
}

function isMeaningfulQuickProductDraft(payload) {
  return (
    Boolean(`${payload?.name || ''}`.trim()) ||
    Boolean(`${payload?.price || ''}`.trim()) ||
    Boolean(`${payload?.stock || ''}`.trim())
  );
}

export default function QuickCreateProductModal({ initialName = '', onCreated, onClose }) {
  const queryClient = useQueryClient();
  const { user, userProfile } = useAuth();
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const autosaveUserId = ownerId || ownerEmail || 'anon';
  const initialForm = useMemo(() => buildQuickProductForm(initialName), [initialName]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  const draftRecovery = useDraftRecovery({
    module: 'products_quick_create',
    userId: autosaveUserId,
    recordId: 'new',
    remoteUpdatedAt: null,
    baselineSnapshot: serializeQuickProductForm(initialForm),
    enabled: Boolean(autosaveUserId),
    isMeaningfulDraft: isMeaningfulQuickProductDraft,
  });

  const autosaveSerializer = useCallback((value) => serializeQuickProductForm(value), []);

  const autosave = useAutosave({
    module: 'products_quick_create',
    userId: autosaveUserId,
    recordId: 'new',
    data: form,
    serialize: autosaveSerializer,
    remoteEnabled: false,
    enabled: hasUserEdited && draftRecovery.resolved,
    paused: !draftRecovery.resolved,
    localDelay: 700,
  });

  const update = (field, value) => {
    setHasUserEdited(true);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRecoverDraft = () => {
    const recovered = draftRecovery.recoverDraft();
    if (!recovered) return;

    setForm(restoreQuickProductForm(recovered, initialForm));
    setHasUserEdited(true);
    toast.success('Borrador de producto recuperado');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (!user && !ownerEmail) {
      toast.error('Usuario no autenticado');
      return;
    }

    autosave.cancelPending();
    const localResult = autosave.flushLocalDraft();
    const payload = localResult?.payload || serializeQuickProductForm(form);

    setLoading(true);

    try {
      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de crear producto:', profileError?.message || profileError);
        }
      }

      const initialPayload = {
        user_id: ownerId,
        created_by: ownerEmail || null,
        name: payload.name,
        sale_price: parseFloat(payload.price) || 0,
        current_stock: parseFloat(payload.stock) || 0,
        product_type: 'fisico',
        status: 'active',
      };

      const insertProduct = async (candidate) => {
        const { data, error } = await supabase
          .from('products')
          .insert(candidate)
          .select()
          .single();
        if (!error) return data;

        if (isMissingColumnError(error, 'products.user_id') || isMissingColumnError(error, 'user_id')) {
          const next = { ...candidate };
          delete next.user_id;
          return insertProduct(next);
        }
        if (isMissingColumnError(error, 'products.created_by') || isMissingColumnError(error, 'created_by')) {
          const next = { ...candidate };
          delete next.created_by;
          return insertProduct(next);
        }
        if (isMissingColumnError(error, 'products.current_stock') || isMissingColumnError(error, 'current_stock')) {
          const next = { ...candidate };
          delete next.current_stock;
          return insertProduct(next);
        }
        if (isMissingColumnError(error, 'products.product_type') || isMissingColumnError(error, 'product_type')) {
          const next = { ...candidate };
          delete next.product_type;
          return insertProduct(next);
        }
        if (hasOwnerConstraintIssue(error, 'products')) {
          const next = { ...candidate };
          delete next.user_id;
          return insertProduct(next);
        }
        throw error;
      };

      const productData = await insertProduct(initialPayload);

      autosave.markRemoteSynced(payload, {
        remoteUpdatedAt: productData?.updated_at || new Date().toISOString(),
        clearDraftAfterSync: true,
      });

      toast.success(`Producto "${payload.name}" creado`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      onCreated({
        id: productData.id,
        product_name: payload.name,
        sale_price: parseFloat(payload.price) || 0,
        current_stock: parseFloat(payload.stock) || 0,
        product_type: productData.product_type || 'fisico',
        descripcion: productData.descripcion || null,
      });
    } catch (error) {
      toast.error(`Error: ${error.message || 'No se pudo crear el producto'}`);
    } finally {
      setLoading(false);
    }
  };

  const autosaveStatus = loading ? 'saving' : autosave.status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <DraftRecoveryDialog
        open={draftRecovery.shouldPrompt}
        savedAt={draftRecovery.draftSavedAt}
        onRecover={handleRecoverDraft}
        onDiscard={draftRecovery.discardDraft}
      />

      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="font-bold text-foreground">Nuevo Producto</h3>
            <AutosaveStatus status={autosaveStatus} />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre del producto *</Label>
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} className="mt-1" placeholder="Ej: Servicio de diseño" />
          </div>
          <div>
            <Label className="text-xs">Precio de venta</Label>
            <Input type="number" value={form.price} onChange={(e) => update('price', e.target.value)} className="mt-1" placeholder="0.00" min="0" />
          </div>
          <div>
            <Label className="text-xs">Stock inicial</Label>
            <Input type="number" value={form.stock} onChange={(e) => update('stock', e.target.value)} className="mt-1" placeholder="0" min="0" />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-primary" onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Guardando...' : 'Crear y seleccionar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
