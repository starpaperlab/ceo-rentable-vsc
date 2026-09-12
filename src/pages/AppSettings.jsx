import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useAutosave } from '@/hooks/useAutosave';
import { useDraftRecovery } from '@/hooks/useDraftRecovery';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Upload, Info, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import PageTour from '@/components/shared/PageTour';
import AutosaveStatus from '@/components/shared/AutosaveStatus';
import DraftRecoveryDialog from '@/components/shared/DraftRecoveryDialog';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import {
  extractMissingColumnFromError,
  hasOwnerConstraintIssue,
  isMissingColumnError,
  updateOwnedRowById,
} from '@/lib/supabaseOwnership';

const TOUR_STEPS = [
  { title: 'Configuración 🛠️', description: 'Aquí ajustas los datos de tu negocio: nombre, moneda, metas y el branding que aparece en tus facturas y cotizaciones.' },
  { title: 'Meta de margen 🎯', description: 'Define el margen % que quieres lograr. Este número se usa para calcular tu CEO Score y darte alertas cuando un producto no lo alcanza.' },
  { title: 'Branding en documentos 🎨', description: 'El logo, color y tipografía que configures aquí aparecerán en todas tus facturas y cotizaciones.' },
];

const BRAND_COLORS = ['#D94F8A', '#B57EDC', '#C9A227', '#4CAF50', '#2196F3'];
const LOGO_SIZE_OPTIONS = {
  small: 18,
  medium: 24,
  large: 34,
  custom: 24,
};

const DEFAULT_DOCUMENT_PREFS = {
  doc_show_socials: true,
  doc_show_fiscal_id: true,
  doc_show_address: true,
  doc_show_contact: true,
  doc_show_signature: false,
};

const GOOGLE_FONTS = [
  { label: 'Inter (Moderna)', value: 'Inter' },
  { label: 'Playfair Display (Elegante)', value: 'Playfair Display' },
  { label: 'Montserrat (Profesional)', value: 'Montserrat' },
  { label: 'Lato (Limpia)', value: 'Lato' },
  { label: 'Poppins (Creativa)', value: 'Poppins' },
  { label: 'Merriweather (Clásica)', value: 'Merriweather' },
  { label: 'Raleway (Premium)', value: 'Raleway' },
  { label: 'Open Sans (Neutral)', value: 'Open Sans' },
];

function buildSettingsForm(config = {}, userProfile, ownerEmail) {
  return {
    business_name: config.business_name || '',
    brand_color: config.brand_color || '#D94F8A',
    brand_accent_color: config.brand_accent_color || '#111827',
    font_family: config.font_family || 'Inter',
    logo_url: config.logo_url || '',
    fiscal_name: config.fiscal_name || '',
    fiscal_id: config.fiscal_id || '',
    fiscal_address: config.fiscal_address || '',
    contact_name: config.contact_name || userProfile?.full_name || '',
    contact_title: config.contact_title || '',
    contact_email: config.contact_email || ownerEmail,
    phone_primary: config.phone_primary || '',
    phone_secondary: config.phone_secondary || '',
    address: config.address || config.fiscal_address || '',
    city_country: config.city_country || '',
    instagram_url: config.instagram_url || '',
    facebook_url: config.facebook_url || '',
    tiktok_url: config.tiktok_url || '',
    linkedin_url: config.linkedin_url || '',
    website_url: config.website_url || '',
    whatsapp_url: config.whatsapp_url || '',
    logo_position: config.logo_position || 'left',
    ...DEFAULT_DOCUMENT_PREFS,
    doc_show_socials: config.doc_show_socials ?? DEFAULT_DOCUMENT_PREFS.doc_show_socials,
    doc_show_fiscal_id: config.doc_show_fiscal_id ?? DEFAULT_DOCUMENT_PREFS.doc_show_fiscal_id,
    doc_show_address: config.doc_show_address ?? DEFAULT_DOCUMENT_PREFS.doc_show_address,
    doc_show_contact: config.doc_show_contact ?? DEFAULT_DOCUMENT_PREFS.doc_show_contact,
    doc_show_signature: config.doc_show_signature ?? DEFAULT_DOCUMENT_PREFS.doc_show_signature,
    currency: config.currency || 'USD',
    country_code: config.country_code || 'DO',
    timezone: config.timezone || 'America/Santo_Domingo',
    tax_enabled: config.tax_enabled ?? false,
    tax_name: config.tax_name || 'ITBIS',
    tax_rate: Number(config.tax_rate || 0),
    bank_name: config.bank_name || '',
    bank_account_name: config.bank_account_name || '',
    bank_account_number: config.bank_account_number || '',
    bank_account_type: config.bank_account_type || '',
    payment_instructions: config.payment_instructions || '',
    signature_name: config.signature_name || '',
    signature_title: config.signature_title || '',
    terms_text: config.terms_text || '',
    invoice_prefix: config.invoice_prefix || 'FAC',
    quote_prefix: config.quote_prefix || 'COT',
    next_invoice_number: Number(config.next_invoice_number || 1),
    next_quote_number: Number(config.next_quote_number || 1),
    quarterly_goal: Number(config.quarterly_goal || 0),
    target_margin_pct: Number(config.target_margin_pct || 40),
    logo_size: config.logo_size || 'medium',
    logo_width: Number(config.logo_width || LOGO_SIZE_OPTIONS.medium),
  };
}

function getLogoWidth({ logoSize, logoWidth }) {
  if (logoSize === 'custom') {
    const customWidth = Number(logoWidth || 0);
    return Number.isFinite(customWidth) && customWidth > 0 ? customWidth : LOGO_SIZE_OPTIONS.medium;
  }
  return LOGO_SIZE_OPTIONS[logoSize] || LOGO_SIZE_OPTIONS.medium;
}

function serializeSettingsForm(raw) {
  return {
    ...raw,
    fiscal_address: raw.fiscal_address || raw.address || '',
    quarterly_goal: Number(raw.quarterly_goal || 0),
    target_margin_pct: Number(raw.target_margin_pct || 0),
    tax_rate: Number(raw.tax_rate || 0),
    next_invoice_number: Math.max(1, Number(raw.next_invoice_number || 1)),
    next_quote_number: Math.max(1, Number(raw.next_quote_number || 1)),
    logo_width: getLogoWidth({ logoSize: raw.logo_size, logoWidth: raw.logo_width }),
  };
}

function isMeaningfulSettingsDraft(payload) {
  return (
    Boolean(`${payload?.business_name || ''}`.trim()) ||
    Boolean(`${payload?.fiscal_name || ''}`.trim()) ||
    Boolean(`${payload?.contact_name || ''}`.trim()) ||
    Boolean(`${payload?.contact_email || ''}`.trim()) ||
    Boolean(`${payload?.logo_url || ''}`.trim()) ||
    Boolean(`${payload?.website_url || ''}`.trim()) ||
    Boolean(`${payload?.instagram_url || ''}`.trim()) ||
    Boolean(`${payload?.facebook_url || ''}`.trim()) ||
    Boolean(`${payload?.whatsapp_url || ''}`.trim()) ||
    payload?.currency !== 'USD' ||
    Number(payload?.quarterly_goal || 0) > 0 ||
    Number(payload?.target_margin_pct || 0) !== 40
  );
}

export default function AppSettings() {
  const { setCurrency } = useCurrency();
  const {
    activeWorkspace,
    activeWorkspaceId,
    adminMode,
    enabled,
    fetchRows,
    ownerEmail,
    ownerId,
    queryKey: contextQueryKey,
    scopedAdminMode,
    scopedOwnerEmail,
    scopedOwnerId,
    user,
    userProfile,
    writeOwnerEmail,
    writeOwnerId,
  } = useWorkContextScope();
  const writable = adminMode || Boolean(activeWorkspace?.legacy) || ['owner', 'admin'].includes(activeWorkspace?.role);
  const contextKey = contextQueryKey.join(':');
  const queryClient = useQueryClient();
  const autosaveUserId = ownerId || ownerEmail || 'anon';

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['business-config', contextKey],
    queryFn: () => fetchRows({
      table: 'business_config',
      orderBy: 'updated_at',
      ascending: false,
    }),
    enabled,
  });

  const config = configs[0] || {};
  const baselineForm = useMemo(
    () => buildSettingsForm({
      ...config,
      business_name: config.business_name || activeWorkspace?.name || '',
      logo_url: config.logo_url || activeWorkspace?.logo_url || '',
      brand_color: config.brand_color || activeWorkspace?.brand_primary_color || '#D94F8A',
      brand_accent_color: config.brand_accent_color || activeWorkspace?.brand_accent_color || '#111827',
      currency: config.currency || activeWorkspace?.currency_code || 'USD',
      country_code: config.country_code || activeWorkspace?.country_code || 'DO',
      timezone: config.timezone || activeWorkspace?.timezone || 'America/Santo_Domingo',
    }, userProfile, ownerEmail),
    [activeWorkspace?.brand_accent_color, activeWorkspace?.brand_primary_color, activeWorkspace?.country_code, activeWorkspace?.currency_code, activeWorkspace?.logo_url, activeWorkspace?.name, activeWorkspace?.timezone, config, ownerEmail, userProfile]
  );

  const [form, setForm] = useState(() => buildSettingsForm({}, userProfile, ownerEmail));
  const [currentConfigId, setCurrentConfigId] = useState(null);
  const [currentRemoteUpdatedAt, setCurrentRemoteUpdatedAt] = useState(null);
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  useEffect(() => {
    setCurrentConfigId(null);
    setCurrentRemoteUpdatedAt(null);
    setHasBootstrapped(false);
    setHasUserEdited(false);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (isLoading || hasBootstrapped) return;
    setForm(baselineForm);
    setCurrentConfigId(config.id || null);
    setCurrentRemoteUpdatedAt(config.updated_at || null);
    setHasBootstrapped(true);
  }, [baselineForm, config.id, config.updated_at, hasBootstrapped, isLoading]);

  useEffect(() => {
    if (!config.id) return;
    setCurrentConfigId((prev) => prev || config.id);
    setCurrentRemoteUpdatedAt((prev) => prev || config.updated_at || null);
  }, [config.id, config.updated_at]);

  const draftRecovery = useDraftRecovery({
    module: 'business_config',
    userId: autosaveUserId,
    recordId: currentConfigId || 'new',
    remoteUpdatedAt: currentRemoteUpdatedAt,
    baselineSnapshot: serializeSettingsForm(baselineForm),
    enabled: hasBootstrapped && Boolean(autosaveUserId),
    isMeaningfulDraft: isMeaningfulSettingsDraft,
  });

  const persistSettings = useCallback(async (data) => {
    const skippedColumns = new Set();

    if (!writable) {
      throw new Error('Tu acceso es de solo lectura.');
    }

    if (!adminMode && !writeOwnerId && !writeOwnerEmail) {
      throw new Error('Tu sesión no está lista. Recarga la página e intenta de nuevo.');
    }

    if (ownerId) {
      try {
        await ensureDbUserRecord({ user, userProfile });
      } catch (profileError) {
        console.warn('No se pudo asegurar perfil antes de guardar configuración:', profileError?.message || profileError);
      }
    }

    const serialized = serializeSettingsForm(data);
    const payload = {
      ...serialized,
      workspace_id: activeWorkspaceId || null,
      user_id: writeOwnerId,
      created_by: writeOwnerEmail,
      updated_at: new Date().toISOString(),
    };

    const runSave = async (safePayload) => {
      if (currentConfigId) {
        await updateOwnedRowById({
          table: 'business_config',
          id: currentConfigId,
          payload: safePayload,
          ownerId: scopedOwnerId,
          ownerEmail: scopedOwnerEmail,
          adminMode: scopedAdminMode,
        });
        return {
          id: currentConfigId,
          updated_at: safePayload.updated_at,
        };
      }

      const { data: insertedRow, error } = await supabase
        .from('business_config')
        .insert({ ...safePayload, created_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;

      if (insertedRow?.id) {
        setCurrentConfigId(insertedRow.id);
      }

      return insertedRow;
    };

    const runSaveWithMissingColumnFallback = async (initialPayload) => {
      const safePayload = { ...initialPayload };

      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          return await runSave(safePayload);
        } catch (error) {
          const missingColumn = extractMissingColumnFromError(error);
          if (missingColumn && Object.prototype.hasOwnProperty.call(safePayload, missingColumn)) {
            skippedColumns.add(missingColumn);
            delete safePayload[missingColumn];
            continue;
          }
          throw error;
        }
      }

      throw new Error('No se pudo guardar la configuración porque Supabase sigue reportando columnas faltantes.');
    };

    let savedRow;
    try {
      savedRow = await runSaveWithMissingColumnFallback(payload);
    } catch (error) {
      if (
        isMissingColumnError(error, 'business_config.user_id') ||
        isMissingColumnError(error, 'user_id') ||
        isMissingColumnError(error, 'business_config.created_by') ||
        isMissingColumnError(error, 'created_by')
      ) {
        const noUserPayload = { ...payload };
        delete noUserPayload.user_id;
        delete noUserPayload.created_by;
        savedRow = await runSave(noUserPayload);
      } else if (hasOwnerConstraintIssue(error, 'business_config')) {
        const noUserPayload = { ...payload };
        delete noUserPayload.user_id;
        savedRow = await runSave(noUserPayload);
      } else {
        throw error;
      }
    }

    if (activeWorkspaceId) {
      const { error: workspaceUpdateError } = await supabase
        .from('workspaces')
        .update({
          name: serialized.business_name?.trim() || activeWorkspace?.name || 'Mi empresa',
          logo_url: serialized.logo_url || null,
          brand_primary_color: serialized.brand_color || null,
          brand_accent_color: serialized.brand_accent_color || null,
          currency_code: serialized.currency || activeWorkspace?.currency_code || 'DOP',
          country_code: serialized.country_code || activeWorkspace?.country_code || null,
          timezone: serialized.timezone || activeWorkspace?.timezone || 'America/Santo_Domingo',
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeWorkspaceId);
      if (workspaceUpdateError) throw workspaceUpdateError;
    }

    const nextUpdatedAt = savedRow?.updated_at || payload.updated_at;
    setCurrentRemoteUpdatedAt(nextUpdatedAt);
    setCurrency(serialized.currency);

    return {
      skippedColumns: Array.from(skippedColumns),
      payload: serialized,
      remoteUpdatedAt: nextUpdatedAt,
      saved: savedRow,
    };
  }, [activeWorkspace?.currency_code, activeWorkspace?.name, activeWorkspaceId, adminMode, currentConfigId, ownerEmail, ownerId, scopedAdminMode, scopedOwnerEmail, scopedOwnerId, setCurrency, user, userProfile, writable, writeOwnerEmail, writeOwnerId]);

  const autosaveSerializer = useCallback((value) => serializeSettingsForm(value), []);

  const autosave = useAutosave({
    module: 'business_config',
    userId: autosaveUserId,
    recordId: currentConfigId || 'new',
    data: form,
    serialize: autosaveSerializer,
    remoteSave: async (payload) => {
      const result = await persistSettings(payload);
      queryClient.invalidateQueries({ queryKey: ['business-config'] });
      return {
        updated_at: result.remoteUpdatedAt,
      };
    },
    remoteEnabled: writable && Boolean(ownerId || ownerEmail),
    remoteUpdatedAt: currentRemoteUpdatedAt,
    enabled: hasBootstrapped && hasUserEdited && draftRecovery.resolved,
    paused: !draftRecovery.resolved,
    localDelay: 900,
    remoteDelay: 8000,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => persistSettings(data),
    onSuccess: (result) => {
      autosave.markRemoteSynced(result.payload, {
        remoteUpdatedAt: result.remoteUpdatedAt,
      });
      queryClient.invalidateQueries({ queryKey: ['business-config'] });
      if (result?.skippedColumns?.length > 0) {
        toast.warning(`Configuración guardada parcialmente. Faltan columnas en Supabase: ${result.skippedColumns.join(', ')}`);
        return;
      }
      toast.success('Configuración guardada');
    },
    onError: (error) => {
      toast.error(`No se pudo guardar configuración: ${error.message}`);
    },
  });

  const update = (field, value) => {
    if (!writable) return;
    setHasUserEdited(true);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRecoverDraft = () => {
    const recovered = draftRecovery.recoverDraft();
    if (!recovered) return;

    setForm(buildSettingsForm(recovered, userProfile, ownerEmail));
    setHasUserEdited(true);
    toast.success('Borrador recuperado');
  };

  const handleLogoUpload = async (e) => {
    if (!writable) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const fallbackToDataUrl = () =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
      });

    const ownerRef = writeOwnerId || writeOwnerEmail || ownerId || ownerEmail || 'anon';
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const fileName = `logos/${ownerRef}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      try {
        const dataUrl = await fallbackToDataUrl();
        update('logo_url', dataUrl);
        toast.warning('No pudimos subir el logo al storage. Se guardará dentro de tu configuración.');
      } catch {
        toast.error(`No se pudo subir el logo: ${uploadError.message}`);
      }
      return;
    }

    const { data: publicUrlData, error: urlError } = supabase.storage
      .from('uploads')
      .getPublicUrl(fileName);

    if (urlError) {
      toast.error(`No se pudo obtener la URL del logo: ${urlError.message}`);
      return;
    }

    update('logo_url', publicUrlData.publicUrl);
    toast.success('Logo cargado');
  };

  const logoWidth = form.logo_size === 'custom'
    ? Number(form.logo_width || LOGO_SIZE_OPTIONS.medium)
    : LOGO_SIZE_OPTIONS[form.logo_size] || LOGO_SIZE_OPTIONS.medium;

  const autosaveStatus = saveMutation.isPending ? 'saving' : autosave.status;

  if (isLoading || !hasBootstrapped) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <DraftRecoveryDialog
        open={draftRecovery.shouldPrompt}
        savedAt={draftRecovery.draftSavedAt}
        onRecover={handleRecoverDraft}
        onDiscard={draftRecovery.discardDraft}
      />

      <PageTour pageName="AppSettings" userEmail={ownerEmail} steps={TOUR_STEPS} />

      {!writable ? (
        <Card className="p-4 border-dashed bg-muted/20">
          <p className="text-sm font-semibold">Modo solo lectura</p>
          <p className="text-xs text-muted-foreground mt-1">Puedes consultar la configuración del negocio, pero no modificar datos, branding ni preferencias.</p>
        </Card>
      ) : null}

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
            <p className="text-sm text-muted-foreground mt-1">Tu negocio y branding se guardan en segundo plano mientras trabajas.</p>
          </div>
          <AutosaveStatus status={autosaveStatus} className="self-start" />
        </div>
      </motion.div>

      <Tabs defaultValue="business">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="business">Mi Negocio</TabsTrigger>
          <TabsTrigger value="operations">Operación y Fiscal</TabsTrigger>
          <TabsTrigger value="payments">Pagos y Documentos</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="space-y-4 mt-4">
          <Card className="space-y-5 p-4 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Datos de empresa</h2>
              <p className="text-xs text-muted-foreground mt-1">Estos datos alimentan cotizaciones, facturas y PDFs.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Nombre comercial</Label>
                <Input value={form.business_name} onChange={(e) => update('business_name', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Nombre legal</Label>
                <Input value={form.fiscal_name} onChange={(e) => update('fiscal_name', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">RNC / identificación fiscal</Label>
                <Input value={form.fiscal_id} onChange={(e) => update('fiscal_id', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Ciudad / país</Label>
                <Input value={form.city_country} onChange={(e) => update('city_country', e.target.value)} className="mt-1" placeholder="Santo Domingo, RD" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Dirección</Label>
              <Input
                value={form.address || form.fiscal_address}
                onChange={(e) => {
                  setHasUserEdited(true);
                  setForm((prev) => ({
                    ...prev,
                    address: e.target.value,
                    fiscal_address: e.target.value,
                  }));
                }}
                className="mt-1"
              />
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Contacto</h2>
              <p className="text-xs text-muted-foreground mt-1">Información visible en documentos si la preferencia está activa.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Persona de contacto</Label>
                <Input value={form.contact_name} onChange={(e) => update('contact_name', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Cargo de la persona de contacto</Label>
                <Input value={form.contact_title} onChange={(e) => update('contact_title', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Email de contacto</Label>
                <Input type="email" value={form.contact_email} onChange={(e) => update('contact_email', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Teléfono principal</Label>
                <Input value={form.phone_primary} onChange={(e) => update('phone_primary', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Teléfono secundario / WhatsApp</Label>
                <Input value={form.phone_secondary} onChange={(e) => update('phone_secondary', e.target.value)} className="mt-1" />
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Redes sociales</h2>
              <p className="text-xs text-muted-foreground mt-1">Se pueden mostrar al pie del PDF cuando la opción está activa.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Instagram</Label>
                <Input value={form.instagram_url} onChange={(e) => update('instagram_url', e.target.value)} className="mt-1" placeholder="@tuempresa o URL" />
              </div>
              <div>
                <Label className="text-xs">Facebook</Label>
                <Input value={form.facebook_url} onChange={(e) => update('facebook_url', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">TikTok</Label>
                <Input value={form.tiktok_url} onChange={(e) => update('tiktok_url', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">LinkedIn</Label>
                <Input value={form.linkedin_url} onChange={(e) => update('linkedin_url', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Página web</Label>
                <Input value={form.website_url} onChange={(e) => update('website_url', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">WhatsApp link</Label>
                <Input value={form.whatsapp_url} onChange={(e) => update('whatsapp_url', e.target.value)} className="mt-1" placeholder="https://wa.me/..." />
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Preferencias internas</h2>
              <p className="text-xs text-muted-foreground mt-1">Usadas para moneda, metas y análisis del negocio.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Moneda global</Label>
                <Select value={form.currency} onValueChange={(value) => update('currency', value)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['USD', 'EUR', 'DOP', 'MXN', 'COP'].map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Meta trimestral</Label>
                <Input type="number" value={form.quarterly_goal || ''} onChange={(e) => update('quarterly_goal', parseFloat(e.target.value) || 0)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Meta de margen (%)</Label>
                <Input type="number" value={form.target_margin_pct || ''} onChange={(e) => update('target_margin_pct', parseFloat(e.target.value) || 0)} className="mt-1" />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="operations" className="space-y-4 mt-4">
          <Card className="space-y-5 p-4 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">País, moneda y zona horaria</h2>
              <p className="mt-1 text-xs text-muted-foreground">Define cómo opera este negocio y cómo se preparan fechas e importes.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label className="text-xs">País</Label>
                <Select value={form.country_code} onValueChange={(value) => update('country_code', value)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DO">República Dominicana</SelectItem>
                    <SelectItem value="US">Estados Unidos</SelectItem>
                    <SelectItem value="ES">España</SelectItem>
                    <SelectItem value="MX">México</SelectItem>
                    <SelectItem value="CO">Colombia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Moneda</Label>
                <Select value={form.currency} onValueChange={(value) => update('currency', value)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['DOP', 'USD', 'EUR', 'MXN', 'COP'].map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Zona horaria</Label>
                <Select value={form.timezone} onValueChange={(value) => update('timezone', value)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Santo_Domingo">Santo Domingo</SelectItem>
                    <SelectItem value="America/New_York">Nueva York / Este</SelectItem>
                    <SelectItem value="America/Mexico_City">Ciudad de México</SelectItem>
                    <SelectItem value="America/Bogota">Bogotá</SelectItem>
                    <SelectItem value="Europe/Madrid">Madrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="space-y-5 p-4 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Impuestos</h2>
              <p className="mt-1 text-xs text-muted-foreground">Configura el impuesto habitual del negocio. Más adelante podrá aplicarse por documento.</p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <div>
                <p className="text-sm font-medium">Usar impuesto por defecto</p>
                <p className="text-xs text-muted-foreground">Actívalo si normalmente facturas con impuesto.</p>
              </div>
              <Switch checked={form.tax_enabled} onCheckedChange={(checked) => update('tax_enabled', checked)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Nombre del impuesto</Label>
                <Input value={form.tax_name} onChange={(e) => update('tax_name', e.target.value)} className="mt-1" placeholder="ITBIS" />
              </div>
              <div>
                <Label className="text-xs">Tasa (%)</Label>
                <Input type="number" min="0" max="100" step="0.001" value={form.tax_rate || ''} onChange={(e) => update('tax_rate', Number(e.target.value || 0))} className="mt-1" />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4 mt-4">
          <Card className="space-y-5 p-4 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Datos de pago</h2>
              <p className="mt-1 text-xs text-muted-foreground">Guarda los datos que podrás mostrar luego en cotizaciones, facturas y recibos.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><Label className="text-xs">Banco</Label><Input value={form.bank_name} onChange={(e) => update('bank_name', e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Titular de la cuenta</Label><Input value={form.bank_account_name} onChange={(e) => update('bank_account_name', e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Número de cuenta</Label><Input value={form.bank_account_number} onChange={(e) => update('bank_account_number', e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Tipo de cuenta</Label><Input value={form.bank_account_type} onChange={(e) => update('bank_account_type', e.target.value)} className="mt-1" placeholder="Ahorros / Corriente" /></div>
            </div>
            <div>
              <Label className="text-xs">Instrucciones de pago</Label>
              <Textarea value={form.payment_instructions} onChange={(e) => update('payment_instructions', e.target.value)} className="mt-1 min-h-24" placeholder="Ej.: Transferir y enviar comprobante por WhatsApp..." />
            </div>
          </Card>

          <Card className="space-y-5 p-4 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Firma y términos</h2>
              <p className="mt-1 text-xs text-muted-foreground">Define la firma comercial y las condiciones que acompañarán los documentos.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><Label className="text-xs">Nombre para firma</Label><Input value={form.signature_name} onChange={(e) => update('signature_name', e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Cargo</Label><Input value={form.signature_title} onChange={(e) => update('signature_title', e.target.value)} className="mt-1" /></div>
            </div>
            <div>
              <Label className="text-xs">Términos y condiciones</Label>
              <Textarea value={form.terms_text} onChange={(e) => update('terms_text', e.target.value)} className="mt-1 min-h-32" placeholder="Condiciones de pago, vigencia de cotización, políticas..." />
            </div>
          </Card>

          <Card className="space-y-5 p-4 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Numeración de documentos</h2>
              <p className="mt-1 text-xs text-muted-foreground">Deja preparada la secuencia que usará cada tipo de documento.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><Label className="text-xs">Prefijo de factura</Label><Input value={form.invoice_prefix} onChange={(e) => update('invoice_prefix', e.target.value.toUpperCase())} className="mt-1" placeholder="FAC" /></div>
              <div><Label className="text-xs">Próximo número de factura</Label><Input type="number" min="1" value={form.next_invoice_number || 1} onChange={(e) => update('next_invoice_number', Math.max(1, Number(e.target.value || 1)))} className="mt-1" /></div>
              <div><Label className="text-xs">Prefijo de cotización</Label><Input value={form.quote_prefix} onChange={(e) => update('quote_prefix', e.target.value.toUpperCase())} className="mt-1" placeholder="COT" /></div>
              <div><Label className="text-xs">Próximo número de cotización</Label><Input type="number" min="1" value={form.next_quote_number || 1} onChange={(e) => update('next_quote_number', Math.max(1, Number(e.target.value || 1)))} className="mt-1" /></div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4 mt-4">
          <Card className="p-5 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-600 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                La identidad visual del negocio se aplica a la interfaz y también queda preparada para documentos exportables.
              </p>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Branding visual</h2>
              <p className="text-xs text-muted-foreground mt-1">Controla la identidad visual de cotizaciones, facturas y PDFs.</p>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Logotipo del Negocio</Label>
              <div className="mt-2 border-2 border-dashed border-border rounded-xl p-8 text-center">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Logo"
                    className="max-h-24 mx-auto object-contain"
                    style={{ width: `${logoWidth * 3.6}px` }}
                  />
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground mt-2">PNG o SVG con fondo transparente (Max. 2MB)</p>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" id="logo-upload" disabled={!writable} />
                <Button variant="outline" size="sm" className="mt-3" onClick={() => document.getElementById('logo-upload')?.click()} disabled={!writable}>
                  Subir Logo
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tamaño del Logo</Label>
                <Select value={form.logo_size} onValueChange={(value) => update('logo_size', value)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Pequeño</SelectItem>
                    <SelectItem value="medium">Mediano</SelectItem>
                    <SelectItem value="large">Grande</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Usa PNG transparente o SVG para mejor calidad.
                </p>
              </div>
              {form.logo_size === 'custom' && (
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Ancho del Logo</Label>
                  <Input
                    type="number"
                    min="12"
                    max="70"
                    value={form.logo_width || ''}
                    onChange={(e) => update('logo_width', Number(e.target.value || 0))}
                    className="mt-2"
                    placeholder="Ancho en mm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">Se conserva la proporción original.</p>
                </div>
              )}
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Posición del Logo</Label>
                <Select value={form.logo_position} onValueChange={(value) => update('logo_position', value)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Izquierda</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                    <SelectItem value="right">Derecha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Color Primario</Label>
              <div className="flex gap-3 mt-2 flex-wrap">
                {BRAND_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-10 h-10 rounded-full transition-all ${form.brand_color === color ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => update('brand_color', color)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <input
                  type="color"
                  value={form.brand_color}
                  onChange={(e) => update('brand_color', e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent p-0.5"
                  title="Elegir color personalizado"
                />
                <Input
                  value={form.brand_color}
                  onChange={(e) => update('brand_color', e.target.value)}
                  placeholder="#D94F8A"
                  className="font-mono text-sm h-10 w-36"
                  maxLength={7}
                />
                <div
                  className="w-10 h-10 rounded-lg border border-border shrink-0"
                  style={{ backgroundColor: form.brand_color }}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Color Secundario / Acento</Label>
              <div className="flex items-center gap-3 mt-3">
                <input
                  type="color"
                  value={form.brand_accent_color}
                  onChange={(e) => update('brand_accent_color', e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent p-0.5"
                  title="Elegir color secundario"
                  disabled={!writable}
                />
                <Input
                  value={form.brand_accent_color}
                  onChange={(e) => update('brand_accent_color', e.target.value)}
                  placeholder="#111827"
                  className="font-mono text-sm h-10 w-36"
                  maxLength={7}
                  disabled={!writable}
                />
                <div className="w-10 h-10 rounded-lg border border-border shrink-0" style={{ backgroundColor: form.brand_accent_color }} />
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tipografía para Documentos</Label>
              <Select value={form.font_family} onValueChange={(value) => update('font_family', value)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOOGLE_FONTS.map((font) => (
                    <SelectItem key={font.value} value={font.value}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1.5">Se aplicará en facturas y cotizaciones exportadas.</p>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Preferencias de documentos</h2>
              <p className="text-xs text-muted-foreground mt-1">Elige qué datos comerciales se muestran en preview y PDF.</p>
            </div>
            {[
              ['doc_show_socials', 'Mostrar redes sociales en PDF'],
              ['doc_show_fiscal_id', 'Mostrar RNC en PDF'],
              ['doc_show_address', 'Mostrar dirección en PDF'],
              ['doc_show_contact', 'Mostrar persona de contacto en PDF'],
              ['doc_show_signature', 'Mostrar firma/aceptación'],
            ].map(([field, label]) => (
              <div key={field} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <Label htmlFor={field} className="text-sm">{label}</Label>
                <Switch id={field} checked={Boolean(form[field])} onCheckedChange={(checked) => update(field, checked)} />
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      <Button
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
        onClick={() => {
          autosave.cancelPending();
          autosave.flushLocalDraft();
          saveMutation.mutate({ ...form, logo_width: logoWidth });
        }}
        disabled={saveMutation.isPending || !writable}
      >
        <Save className="h-4 w-4 mr-2" />
        {saveMutation.isPending ? 'Guardando...' : 'Guardar Configuración'}
      </Button>
    </div>
  );
}
