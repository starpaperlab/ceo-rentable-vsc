import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useAutosave } from '@/hooks/useAutosave';
import { useDraftRecovery } from '@/hooks/useDraftRecovery';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { Eye, GripVertical, ImagePlus, Loader2, Save, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import AutosaveStatus from '@/components/shared/AutosaveStatus';
import DraftRecoveryDialog from '@/components/shared/DraftRecoveryDialog';
import {
  extractMissingColumnFromError,
  fetchOwnedRows,
  hasOwnerConstraintIssue,
  isMissingColumnError,
  updateOwnedRowById,
} from '@/lib/supabaseOwnership';
import { buildDocumentBrandingFields, mapBrandProfileToBusinessConfig, resolveDocumentBranding } from '@/lib/documentBranding';
import {
  COMMERCIAL_ATTACHMENT_LAYOUTS,
  DEFAULT_COMMERCIAL_ATTACHMENT_LAYOUT,
  generateAttachmentId,
  getCommercialAttachmentLayoutLabel,
  resolveVisualAttachmentUrl,
  sanitizeCommercialAttachmentLayout,
  sanitizeVisualAttachments,
  uploadVisualAttachment,
} from '@/lib/visualAttachments';
import LineItemsTable from './LineItemsTable';
import TotalsPanel from './TotalsPanel';
import PreviewModal from './PreviewModal';
import AdditionalChargesEditor from './AdditionalChargesEditor';

const BRAND_COLORS = ['#D94F8A', '#B57EDC', '#C9A227', '#4CAF50', '#2196F3'];
const DEFAULT_ITEMS = [{ description: '', unit_price: 0, quantity: 1, total: 0 }];
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

const REQUIRED_DOCUMENT_COLUMNS = new Set([
  'commercial_attachments_layout',
]);

const COMMERCIAL_ATTACHMENT_LAYOUT_OPTIONS = [
  {
    value: COMMERCIAL_ATTACHMENT_LAYOUTS.PREMIUM,
    label: getCommercialAttachmentLayoutLabel(COMMERCIAL_ATTACHMENT_LAYOUTS.PREMIUM),
  },
  {
    value: COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_2,
    label: getCommercialAttachmentLayoutLabel(COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_2),
  },
  {
    value: COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_4,
    label: getCommercialAttachmentLayoutLabel(COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_4),
  },
];

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

const ENABLE_STOCK_DEDUCTION_ON_INVOICE_CREATE = false;

function sanitizeLineItems(rawItems = []) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((item) => {
      const description = `${item?.description || ''}`.trim();
      const quantity = Number(item?.quantity || 0);
      const unitPrice = Number(item?.unit_price || 0);
      return {
        ...item,
        description,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
        total: Number.isFinite(Number(item?.total))
          ? Number(item.total)
          : (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0),
      };
    })
    .filter((item) => item.description.length > 0);
}

function sanitizeAdditionalCharges(rawCharges = []) {
  if (!Array.isArray(rawCharges)) return [];
  return rawCharges
    .map((charge) => {
      const name = `${charge?.name || charge?.concept || charge?.label || ''}`.trim();
      const amount = Number(charge?.amount || 0);
      return {
        name,
        amount: Number.isFinite(amount) ? amount : 0,
      };
    })
    .filter((charge) => charge.name.length > 0 && charge.amount > 0);
}

function getLogoWidth({ logoSize, logoWidth }) {
  if (logoSize === 'custom') {
    const customWidth = Number(logoWidth || 0);
    return Number.isFinite(customWidth) && customWidth > 0 ? customWidth : LOGO_SIZE_OPTIONS.medium;
  }
  return LOGO_SIZE_OPTIONS[logoSize] || LOGO_SIZE_OPTIONS.medium;
}

function genNumber(type, count) {
  const prefix = type === 'invoice' ? 'FAC' : 'COT';
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

function calculateDocumentTotals(raw = {}) {
  const lineItems = Array.isArray(raw?.line_items) ? raw.line_items : [];
  const subtotal = lineItems.reduce(
    (sum, item) => sum + (parseFloat(item?.unit_price || 0) * parseFloat(item?.quantity || 0)),
    0
  );
  const additionalCharges = sanitizeAdditionalCharges(raw?.additional_charges || []);
  const additionalChargesTotal = additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
  const subtotalBeforeTax = subtotal + additionalChargesTotal;
  const taxPct = Number(raw?.tax_pct || 0);
  const taxEnabled = Boolean(raw?.tax_enabled);
  const taxAmount = taxEnabled ? subtotalBeforeTax * (taxPct / 100) : 0;
  const totalFinal = subtotalBeforeTax + taxAmount;

  return {
    additionalCharges,
    additionalChargesTotal,
    subtotal,
    subtotalBeforeTax,
    taxAmount,
    totalFinal,
  };
}

function sanitizeDocumentPayload(raw) {
  const totals = calculateDocumentTotals(raw);
  const brandingFields = buildDocumentBrandingFields(raw, {
    brandProfileId: raw?.brand_profile_id || null,
  });
  const visualAttachments = sanitizeVisualAttachments(raw?.visual_attachments || []);
  const commercialAttachmentsLayout = sanitizeCommercialAttachmentLayout(
    raw?.commercial_attachments_layout || raw?.visual_attachments_layout
  );

  return {
    ...raw,
    ...brandingFields,
    date: raw?.date || new Date().toISOString().slice(0, 10),
    due_date: raw?.due_date || null,
    client_id: raw?.client_id || null,
    client_name: `${raw?.client_name || ''}`.trim() || null,
    client_email: `${raw?.client_email || ''}`.trim() || null,
    client_phone: `${raw?.client_phone || ''}`.trim() || null,
    notes: `${raw?.notes || ''}`.trim() || null,
    logo_url: raw?.logo_url || null,
    logo_size: raw?.logo_size || 'medium',
    logo_width: getLogoWidth({ logoSize: raw?.logo_size || 'medium', logoWidth: raw?.logo_width }),
    logo_position: raw?.logo_position || 'left',
    fiscal_address: raw?.fiscal_address || raw?.address || null,
    line_items: sanitizeLineItems(raw?.line_items || []),
    additional_charges: totals.additionalCharges,
    additional_charges_total: totals.additionalChargesTotal,
    visual_attachments: visualAttachments,
    commercial_attachments_layout: commercialAttachmentsLayout,
    subtotal: totals.subtotal,
    subtotal_before_tax: totals.subtotalBeforeTax,
    tax_enabled: Boolean(raw?.tax_enabled),
    tax_pct: Number(raw?.tax_pct || 0),
    tax_amount: totals.taxAmount,
    total_final: totals.totalFinal,
  };
}

function buildDocumentFormState({
  type,
  doc,
  config,
  totalCount,
  ownerEmail,
  ownerName,
  contextBrandProfileId = null,
}) {
  const numberField = type === 'invoice' ? 'invoice_number' : 'quote_number';
  const resolvedBranding = resolveDocumentBranding(doc || {}, config || {});

  return {
    [numberField]: doc?.[numberField] || genNumber(type, totalCount),
    date: doc?.date || new Date().toISOString().split('T')[0],
    client_name: doc?.client_name || '',
    client_email: doc?.client_email || '',
    client_phone: doc?.client_phone || '',
    client_id: doc?.client_id || '',
    line_items: doc?.line_items?.length > 0 ? doc.line_items : [...DEFAULT_ITEMS],
    tax_enabled: doc?.tax_enabled || false,
    due_date: doc?.due_date || '',
    tax_pct: doc?.tax_pct ?? 18,
    notes: doc?.notes || '',
    status: doc?.status || 'pending',
    brand_profile_id: doc?.brand_profile_id || contextBrandProfileId || config?.brand_profile_id || '',
    company_name: doc?.company_name || config?.business_name || (resolvedBranding.company_name === 'Mi Empresa' ? '' : resolvedBranding.company_name) || '',
    logo_url: resolvedBranding.logo_url || '',
    logo_size: resolvedBranding.logo_size || config?.logo_size || 'medium',
    logo_width: resolvedBranding.logo_width || config?.logo_width || LOGO_SIZE_OPTIONS.medium,
    brand_color: resolvedBranding.brand_color || '#D94F8A',
    font_family: resolvedBranding.font_family || config?.font_family || 'Inter',
    fiscal_name: resolvedBranding.fiscal_name || '',
    fiscal_id: resolvedBranding.fiscal_id || '',
    fiscal_address: resolvedBranding.fiscal_address || resolvedBranding.address || '',
    contact_name: resolvedBranding.contact_name || ownerName || ownerEmail || '',
    contact_title: resolvedBranding.contact_title || resolvedBranding.contact_role || '',
    contact_email: resolvedBranding.contact_email || ownerEmail || '',
    phone_primary: resolvedBranding.phone_primary || '',
    phone_secondary: resolvedBranding.phone_secondary || '',
    address: resolvedBranding.address || resolvedBranding.fiscal_address || '',
    city_country: resolvedBranding.city_country || '',
    instagram_url: resolvedBranding.instagram_url || '',
    facebook_url: resolvedBranding.facebook_url || '',
    tiktok_url: resolvedBranding.tiktok_url || '',
    linkedin_url: resolvedBranding.linkedin_url || '',
    website_url: resolvedBranding.website_url || '',
    whatsapp_url: resolvedBranding.whatsapp_url || '',
    logo_position: resolvedBranding.logo_position || 'left',
    doc_show_socials: resolvedBranding.doc_show_socials ?? DEFAULT_DOCUMENT_PREFS.doc_show_socials,
    doc_show_fiscal_id: resolvedBranding.doc_show_fiscal_id ?? DEFAULT_DOCUMENT_PREFS.doc_show_fiscal_id,
    doc_show_address: resolvedBranding.doc_show_address ?? DEFAULT_DOCUMENT_PREFS.doc_show_address,
    doc_show_contact: resolvedBranding.doc_show_contact ?? DEFAULT_DOCUMENT_PREFS.doc_show_contact,
    doc_show_signature: resolvedBranding.doc_show_signature ?? DEFAULT_DOCUMENT_PREFS.doc_show_signature,
    additional_charges: doc?.additional_charges?.length > 0 ? doc.additional_charges : [],
    visual_attachments: sanitizeVisualAttachments(doc?.visual_attachments || []),
    commercial_attachments_layout: sanitizeCommercialAttachmentLayout(
      doc?.commercial_attachments_layout || doc?.visual_attachments_layout
    ),
  };
}

function restoreDocumentFormState(raw, fallbackState) {
  return {
    ...fallbackState,
    ...raw,
    client_name: raw?.client_name || '',
    client_email: raw?.client_email || '',
    client_phone: raw?.client_phone || '',
    client_id: raw?.client_id || '',
    notes: raw?.notes || '',
    brand_profile_id: raw?.brand_profile_id || '',
    company_name: raw?.company_name || '',
    logo_url: raw?.logo_url || '',
    fiscal_name: raw?.fiscal_name || '',
    fiscal_id: raw?.fiscal_id || '',
    fiscal_address: raw?.fiscal_address || '',
    contact_name: raw?.contact_name || '',
    contact_title: raw?.contact_title || '',
    contact_email: raw?.contact_email || '',
    phone_primary: raw?.phone_primary || '',
    phone_secondary: raw?.phone_secondary || '',
    address: raw?.address || '',
    city_country: raw?.city_country || '',
    instagram_url: raw?.instagram_url || '',
    facebook_url: raw?.facebook_url || '',
    tiktok_url: raw?.tiktok_url || '',
    linkedin_url: raw?.linkedin_url || '',
    website_url: raw?.website_url || '',
    whatsapp_url: raw?.whatsapp_url || '',
    commercial_attachments_layout: sanitizeCommercialAttachmentLayout(raw?.commercial_attachments_layout),
    line_items: raw?.line_items?.length > 0 ? raw.line_items : [...DEFAULT_ITEMS],
    additional_charges: Array.isArray(raw?.additional_charges) ? raw.additional_charges : [],
    visual_attachments: sanitizeVisualAttachments(raw?.visual_attachments || []),
  };
}

function isMeaningfulDocumentDraft(payload) {
  return (
    sanitizeLineItems(payload?.line_items || []).length > 0 ||
    sanitizeAdditionalCharges(payload?.additional_charges || []).length > 0 ||
    Boolean(`${payload?.client_name || ''}`.trim()) ||
    Boolean(`${payload?.client_email || ''}`.trim()) ||
    Boolean(`${payload?.client_phone || ''}`.trim()) ||
    Boolean(`${payload?.notes || ''}`.trim()) ||
    Boolean(`${payload?.company_name || ''}`.trim()) ||
    Boolean(`${payload?.logo_url || ''}`.trim()) ||
    sanitizeCommercialAttachmentLayout(payload?.commercial_attachments_layout) !== DEFAULT_COMMERCIAL_ATTACHMENT_LAYOUT ||
    sanitizeVisualAttachments(payload?.visual_attachments || []).length > 0
  );
}

export default function DocumentForm({
  type,
  doc,
  onSave,
  onCancel,
  clients,
  products,
  inventoryItems = [],
  config,
  brandProfiles = [],
  totalCount,
  ownerId = null,
  ownerEmail = '',
  ownerName = '',
  adminMode = false,
  contextBrandProfileId = null,
}) {
  const queryClient = useQueryClient();
  const logoInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const draftStorageRef = useRef(doc?.id || `${type}-draft-${Date.now()}`);
  const [showPreview, setShowPreview] = useState(false);
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState({});
  const [attachmentUploadState, setAttachmentUploadState] = useState({
    total: 0,
    completed: 0,
    isUploading: false,
  });

  const numberField = type === 'invoice' ? 'invoice_number' : 'quote_number';
  const entityTable = type === 'invoice' ? 'invoices' : 'quotes';
  const queryKey = type === 'invoice' ? 'invoices' : 'quotes';
  const autosaveUserId = ownerId || ownerEmail || 'anon';
  const remoteRecordId = doc?.id || 'new';
  const adminBrandProfiles = useMemo(() => Array.isArray(brandProfiles) ? brandProfiles : [], [brandProfiles]);
  const canSelectAdminBrand = adminMode && !doc?.id && adminBrandProfiles.length > 0;

  const initialFormState = useMemo(() => buildDocumentFormState({
    type,
    doc,
    config,
    totalCount,
    ownerEmail,
    ownerName,
    contextBrandProfileId,
  }), [config, contextBrandProfileId, doc, ownerEmail, ownerName, totalCount, type]);

  const [form, setForm] = useState(initialFormState);

  useEffect(() => {
    if (!hasUserEdited) {
      setForm(initialFormState);
    }
  }, [hasUserEdited, initialFormState]);

  const previewData = useMemo(() => sanitizeDocumentPayload({
    ...form,
    logo_width: getLogoWidth({ logoSize: form.logo_size, logoWidth: form.logo_width }),
  }), [form]);

  const subtotal = previewData.subtotal || 0;
  const additionalCharges = previewData.additional_charges || [];
  const additionalChargesTotal = previewData.additional_charges_total || 0;
  const subtotalBeforeTax = previewData.subtotal_before_tax || 0;

  const draftRecovery = useDraftRecovery({
    module: entityTable,
    userId: autosaveUserId,
    recordId: remoteRecordId,
    remoteUpdatedAt: doc?.updated_at || null,
    baselineSnapshot: sanitizeDocumentPayload(initialFormState),
    enabled: Boolean(autosaveUserId),
    isMeaningfulDraft: isMeaningfulDocumentDraft,
  });

  const autosaveSerializer = useCallback((value) => sanitizeDocumentPayload({
    ...value,
    logo_width: getLogoWidth({ logoSize: value.logo_size, logoWidth: value.logo_width }),
  }), []);

  const autosave = useAutosave({
    module: entityTable,
    userId: autosaveUserId,
    recordId: remoteRecordId,
    data: form,
    serialize: autosaveSerializer,
    remoteEnabled: Boolean(doc?.id),
    remoteUpdatedAt: doc?.updated_at || null,
    enabled: hasUserEdited && draftRecovery.resolved,
    paused: !draftRecovery.resolved,
    localDelay: 800,
    remoteDelay: 7000,
    remoteSave: async (payload) => {
      const result = await persistDocument(payload, { silentInventory: true });
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      return {
        updated_at: result.remoteUpdatedAt,
      };
    },
  });

  function markEdited() {
    setHasUserEdited(true);
  }

  const update = (field, value) => {
    markEdited();
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const replaceForm = (nextForm, { markAsEdited = false } = {}) => {
    if (markAsEdited) {
      setHasUserEdited(true);
    }
    setForm(nextForm);
  };

  const handleClientSelect = (clientId) => {
    markEdited();
    if (clientId === '_manual') {
      setForm((prev) => ({ ...prev, client_id: '' }));
      return;
    }

    const client = clients.find((item) => item.id === clientId);
    if (client) {
      setForm((prev) => ({
        ...prev,
        client_id: client.id,
        client_name: client.name,
        client_email: client.email || '',
        client_phone: client.phone || '',
      }));
    }
  };

  const handleRecoverDraft = () => {
    const recovered = draftRecovery.recoverDraft();
    if (!recovered) return;

    replaceForm(restoreDocumentFormState(recovered, initialFormState), { markAsEdited: true });
    toast.success('Borrador recuperado');
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fallbackToDataUrl = () =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
      });

    const ownerRef = ownerId || ownerEmail || 'anon';
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const fileName = `logos/${ownerRef}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      try {
        const dataUrl = await fallbackToDataUrl();
        update('logo_url', dataUrl);
        toast.warning('No pudimos subir el logo al storage. Se guardará dentro del documento.');
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

  const getOwnerPayload = () => ({
    user_id: ownerId || null,
    created_by: ownerEmail || null,
  });

  const insertOwnedRow = async (tableName, payload) => {
    const safePayload = { ...payload };

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .insert(safePayload)
          .select()
          .single();
        if (error) throw error;
        return data;
      } catch (error) {
        const missingColumn = extractMissingColumnFromError(error);
        if (missingColumn && Object.prototype.hasOwnProperty.call(safePayload, missingColumn)) {
          if (REQUIRED_DOCUMENT_COLUMNS.has(missingColumn)) {
            throw error;
          }
          delete safePayload[missingColumn];
          continue;
        }

        if (
          isMissingColumnError(error, `${tableName}.user_id`) ||
          isMissingColumnError(error, 'user_id') ||
          isMissingColumnError(error, `${tableName}.created_by`) ||
          isMissingColumnError(error, 'created_by')
        ) {
          delete safePayload.user_id;
          delete safePayload.created_by;
          continue;
        }

        if (hasOwnerConstraintIssue(error, tableName)) {
          delete safePayload.user_id;
          continue;
        }

        throw error;
      }
    }

    throw new Error(`No se pudo guardar en ${tableName} porque Supabase sigue reportando columnas faltantes.`);
  };

  const updateOwnedRow = async (tableName, rowId, payload) => {
    const safePayload = { ...payload };

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await updateOwnedRowById({
          table: tableName,
          id: rowId,
          payload: safePayload,
          ownerId,
          ownerEmail,
          adminMode,
        });
        return;
      } catch (error) {
        const missingColumn = extractMissingColumnFromError(error);
        if (missingColumn && Object.prototype.hasOwnProperty.call(safePayload, missingColumn)) {
          if (REQUIRED_DOCUMENT_COLUMNS.has(missingColumn)) {
            throw error;
          }
          delete safePayload[missingColumn];
          continue;
        }
        throw error;
      }
    }

    throw new Error(`No se pudo actualizar ${tableName} porque Supabase sigue reportando columnas faltantes.`);
  };

  const fetchOwnedInventory = async () => fetchOwnedRows({
    table: 'inventory_items',
    ownerId,
    ownerEmail,
    adminMode,
  });

  const persistDocument = async (data, { silentInventory = false } = {}) => {
    if (!adminMode && !ownerId && !ownerEmail) {
      throw new Error('Tu sesión no está lista. Recarga la página e intenta nuevamente.');
    }

    if (ownerId) {
      try {
        await ensureDbUserRecord({
          user: { id: ownerId, email: ownerEmail || undefined },
          userProfile: ownerId
            ? {
              id: ownerId,
              email: ownerEmail || undefined,
              role: adminMode ? 'admin' : 'user',
              plan: adminMode ? 'admin' : 'free',
              has_access: true,
              onboarding_completed: true,
            }
            : null,
        });
      } catch (profileError) {
        console.warn('No se pudo asegurar perfil antes de guardar documento:', profileError?.message || profileError);
      }
    }

    const safeData = sanitizeDocumentPayload(data);
    safeData.commercial_attachments_layout = sanitizeCommercialAttachmentLayout(
      data?.commercial_attachments_layout || data?.visual_attachments_layout
    );
    const documentData = doc?.id
      ? safeData
      : {
          ...safeData,
          brand_profile_id: safeData.brand_profile_id || contextBrandProfileId || null,
        };
    const payload = doc?.id
      ? (adminMode ? { ...documentData } : { ...documentData, ...getOwnerPayload() })
      : { ...documentData, ...getOwnerPayload() };

    let saved;
    if (doc?.id) {
      await updateOwnedRow(entityTable, doc.id, payload);
      const updatedRows = await fetchOwnedRows({
        table: entityTable,
        ownerId,
        ownerEmail,
        adminMode,
        filters: [{ column: 'id', value: doc.id }],
      });
      saved = updatedRows?.[0] || null;
    } else {
      saved = await insertOwnedRow(entityTable, payload);
    }

    if (ENABLE_STOCK_DEDUCTION_ON_INVOICE_CREATE && type === 'invoice' && !doc?.id && !silentInventory) {
      const ownedInventoryItems = await fetchOwnedInventory();

      for (const lineItem of safeData.line_items || []) {
        if (!lineItem.description) continue;

        const match = ownedInventoryItems.find(
          (item) => item.product_name?.toLowerCase() === lineItem.description?.toLowerCase()
        );

        if (!match) continue;

        const qty = parseFloat(lineItem.quantity) || 1;
        const newStock = Math.max(0, (match.current_stock || 0) - qty);

        await updateOwnedRowById({
          table: 'inventory_items',
          id: match.id,
          payload: { current_stock: newStock },
          ownerId,
          ownerEmail,
          adminMode,
        });

        const movementPayload = {
          inventory_item_id: match.id,
          product_name: match.product_name,
          type: 'salida',
          quantity: qty,
          reason: `Factura: ${safeData.invoice_number || ''}`,
          invoice_number: safeData.invoice_number || '',
          date: safeData.date || new Date().toISOString().split('T')[0],
          ...(adminMode ? {} : getOwnerPayload()),
        };

        await insertOwnedRow('inventory_movements', movementPayload);
      }
    }

    return {
      saved,
      payload: safeData,
      remoteUpdatedAt: saved?.updated_at || new Date().toISOString(),
    };
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => persistDocument(data, { silentInventory: false }),
    onSuccess: (result) => {
      autosave.markRemoteSynced(result.payload, {
        remoteUpdatedAt: result.remoteUpdatedAt,
        clearDraftAfterSync: true,
      });
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success(`${type === 'invoice' ? 'Factura' : 'Cotización'} guardada exitosamente`);
      onSave();
    },
    onError: (error) => {
      const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(' | ');
      toast.error(`No se pudo guardar ${type === 'invoice' ? 'la factura' : 'la cotización'}: ${details || 'Error desconocido'}`);
    },
  });

  const handleSave = () => {
    autosave.cancelPending();
    autosave.flushLocalDraft();
    saveMutation.mutate({
      ...form,
      logo_width: getLogoWidth({ logoSize: form.logo_size, logoWidth: form.logo_width }),
    });
  };

  const autosaveStatus = saveMutation.isPending ? 'saving' : autosave.status;
  const attachmentOwnerRef = doc?.user_id || ownerId || doc?.created_by || ownerEmail || 'anon';
  const attachmentDocumentRef = doc?.id || draftStorageRef.current;

  const applyBrandProfileToForm = useCallback((profileId) => {
    const selectedProfile = adminBrandProfiles.find((profile) => profile.id === profileId);
    if (!selectedProfile) return;

    const brandConfig = mapBrandProfileToBusinessConfig(selectedProfile, { ownerName, ownerEmail });
    const nextBranding = buildDocumentFormState({
      type,
      doc: null,
      config: brandConfig,
      totalCount,
      ownerEmail,
      ownerName,
    });

    markEdited();
    setForm((prev) => ({
      ...prev,
      brand_profile_id: profileId,
      company_name: nextBranding.company_name,
      logo_url: nextBranding.logo_url,
      logo_size: nextBranding.logo_size,
      logo_width: nextBranding.logo_width,
      brand_color: nextBranding.brand_color,
      font_family: nextBranding.font_family,
      fiscal_name: nextBranding.fiscal_name,
      fiscal_id: nextBranding.fiscal_id,
      fiscal_address: nextBranding.fiscal_address,
      contact_name: nextBranding.contact_name,
      contact_title: nextBranding.contact_title,
      contact_email: nextBranding.contact_email,
      phone_primary: nextBranding.phone_primary,
      phone_secondary: nextBranding.phone_secondary,
      address: nextBranding.address,
      city_country: nextBranding.city_country,
      instagram_url: nextBranding.instagram_url,
      facebook_url: nextBranding.facebook_url,
      tiktok_url: nextBranding.tiktok_url,
      linkedin_url: nextBranding.linkedin_url,
      website_url: nextBranding.website_url,
      whatsapp_url: nextBranding.whatsapp_url,
      logo_position: nextBranding.logo_position,
      doc_show_socials: nextBranding.doc_show_socials,
      doc_show_fiscal_id: nextBranding.doc_show_fiscal_id,
      doc_show_address: nextBranding.doc_show_address,
      doc_show_contact: nextBranding.doc_show_contact,
      doc_show_signature: nextBranding.doc_show_signature,
    }));
  }, [adminBrandProfiles, ownerEmail, ownerName, totalCount, type]);

  const handleAttachmentFilesSelected = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    setAttachmentUploadState({
      total: files.length,
      completed: 0,
      isUploading: true,
    });

    const uploaded = [];
    const errors = [];

    for (const file of files) {
      try {
        const attachment = await uploadVisualAttachment({
          file,
          ownerRef: attachmentOwnerRef,
          documentRef: attachmentDocumentRef,
          attachmentId: generateAttachmentId(),
        });
        uploaded.push(attachment);
      } catch (error) {
        errors.push(`${file.name}: ${error?.message || 'No se pudo subir.'}`);
      } finally {
        setAttachmentUploadState((prev) => ({
          ...prev,
          completed: prev.completed + 1,
        }));
      }
    }

    if (uploaded.length > 0) {
      const previewEntries = await Promise.all(uploaded.map(async (attachment) => {
        try {
          return [attachment.id, await resolveVisualAttachmentUrl(attachment)];
        } catch {
          return [attachment.id, ''];
        }
      }));

      setAttachmentPreviewUrls((prev) => ({
        ...prev,
        ...Object.fromEntries(previewEntries),
      }));

      markEdited();
      setForm((prev) => {
        const existing = sanitizeVisualAttachments(prev.visual_attachments || []);
        const merged = sanitizeVisualAttachments([
          ...existing,
          ...uploaded.map((attachment, index) => ({
            ...attachment,
            sort_order: existing.length + index + 1,
            order: existing.length + index + 1,
          })),
        ]);

        return {
          ...prev,
          visual_attachments: merged,
        };
      });
      toast.success(`${uploaded.length} anexo${uploaded.length === 1 ? '' : 's'} cargado${uploaded.length === 1 ? '' : 's'}.`);
    }

    if (errors.length > 0) {
      toast.error(errors.slice(0, 2).join(' | '));
    }

    setAttachmentUploadState((prev) => ({
      ...prev,
      isUploading: false,
    }));
  };

  const updateVisualAttachments = (nextAttachments) => {
    markEdited();
    setForm((prev) => ({
      ...prev,
      visual_attachments: sanitizeVisualAttachments(nextAttachments),
    }));
  };

  const handleAttachmentDragEnd = ({ source, destination }) => {
    if (!destination || destination.index === source.index) return;

    const attachments = sanitizeVisualAttachments(form.visual_attachments || []);
    const reordered = [...attachments];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);

    updateVisualAttachments(reordered.map((attachment, index) => ({
      ...attachment,
      sort_order: index + 1,
      order: index + 1,
    })));
  };

  const removeAttachment = async (attachmentId) => {
    const attachments = sanitizeVisualAttachments(form.visual_attachments || []);
    updateVisualAttachments(attachments.filter((attachment) => attachment.id !== attachmentId));
    setAttachmentPreviewUrls((prev) => {
      const next = { ...prev };
      delete next[attachmentId];
      return next;
    });
  };

  const openAttachmentPreview = async (attachment) => {
    const previewWindow = window.open('', '_blank', 'noopener,noreferrer');
    try {
      const url = await resolveVisualAttachmentUrl(attachment);
      if (!url) {
        previewWindow?.close();
        toast.error('No pudimos abrir la vista previa de ese anexo comercial.');
        return;
      }
      if (previewWindow) {
        previewWindow.location.href = url;
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      previewWindow?.close();
      toast.error(error?.message || 'No pudimos abrir la vista previa del anexo comercial.');
    }
  };

  const visualAttachments = useMemo(
    () => sanitizeVisualAttachments(form.visual_attachments || []),
    [form.visual_attachments]
  );
  const commercialAttachmentLayoutLabel = useMemo(
    () => getCommercialAttachmentLayoutLabel(form.commercial_attachments_layout),
    [form.commercial_attachments_layout]
  );

  useEffect(() => {
    let active = true;

    const resolvePreviews = async () => {
      const nextPreviewMap = {};

      for (const attachment of visualAttachments) {
        try {
          const resolvedUrl = await resolveVisualAttachmentUrl(attachment);
          nextPreviewMap[attachment.id] = resolvedUrl;
        } catch {
          nextPreviewMap[attachment.id] = '';
        }
      }

      if (active) {
        setAttachmentPreviewUrls(nextPreviewMap);
      }
    };

    if (visualAttachments.length === 0) {
      setAttachmentPreviewUrls({});
      return () => {
        active = false;
      };
    }

    resolvePreviews();

    return () => {
      active = false;
    };
  }, [visualAttachments]);

  return (
    <>
      <DraftRecoveryDialog
        open={draftRecovery.shouldPrompt}
        savedAt={draftRecovery.draftSavedAt}
        onRecover={handleRecoverDraft}
        onDiscard={draftRecovery.discardDraft}
      />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {doc ? 'Editar' : 'Nueva'} {type === 'invoice' ? 'Factura' : 'Cotización'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Completa los datos del documento</p>
              </div>
              <AutosaveStatus status={autosaveStatus} />
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-xl border border-dashed border-border">
            {canSelectAdminBrand ? (
              <div className="sm:col-span-3 rounded-xl border bg-white/80 p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marca para este documento</Label>
                    <Select value={form.brand_profile_id || ''} onValueChange={applyBrandProfileToForm}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Selecciona una marca" />
                      </SelectTrigger>
                      <SelectContent>
                        {adminBrandProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name}{profile.is_default ? ' · Predeterminada' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground md:max-w-[260px]">
                    La marca elegida se congela dentro del documento. Eso protege el branding histórico aunque otra admin lo abra después.
                  </p>
                </div>
              </div>
            ) : null}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logo</Label>
              <div className="mt-2 border-2 border-dashed border-border rounded-lg p-3 text-center min-h-[64px] flex flex-col items-center justify-center">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Logo"
                    className="max-h-16 mx-auto object-contain mb-2"
                    style={{ width: `${getLogoWidth({ logoSize: form.logo_size, logoWidth: form.logo_width }) * 3.6}px` }}
                  />
                ) : (
                  <p className="text-[10px] text-muted-foreground mb-2">Sin logo</p>
                )}
                <input type="file" accept="image/*" ref={logoInputRef} className="hidden" onChange={handleLogoUpload} />
                <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => logoInputRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" /> Subir
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nombre Empresa</Label>
              <Input value={form.company_name} onChange={(e) => update('company_name', e.target.value)} className="mt-2" placeholder="Nombre de tu empresa" />
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color de Marca</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {BRAND_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-7 h-7 rounded-full transition-all border-2 ${form.brand_color === color ? 'border-foreground scale-110 shadow-md' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      onClick={() => update('brand_color', color)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="color"
                    value={form.brand_color}
                    onChange={(e) => update('brand_color', e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5"
                    title="Seleccionar color"
                  />
                  <Input
                    value={form.brand_color}
                    onChange={(e) => update('brand_color', e.target.value)}
                    placeholder="#D94F8A"
                    className="font-mono text-xs h-8 w-28"
                    maxLength={7}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipografía</Label>
                <Select value={form.font_family} onValueChange={(value) => update('font_family', value)}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOOGLE_FONTS.map((font) => (
                      <SelectItem key={font.value} value={font.value} style={{ fontFamily: font.value }} className="text-xs">
                        {font.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tamaño del logo</Label>
                <Select value={form.logo_size} onValueChange={(value) => update('logo_size', value)}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Pequeño</SelectItem>
                    <SelectItem value="medium">Mediano</SelectItem>
                    <SelectItem value="large">Grande</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {form.logo_size === 'custom' && (
                  <Input
                    type="number"
                    min="12"
                    max="70"
                    value={form.logo_width || ''}
                    onChange={(e) => update('logo_width', Number(e.target.value || 0))}
                    className="mt-2 h-8 text-xs"
                    placeholder="Ancho en mm"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">{type === 'invoice' ? 'Número de Factura' : 'Número de Cotización'}</Label>
              <Input value={form[numberField]} onChange={(e) => update(numberField, e.target.value)} className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} className="mt-1" />
            </div>
            {type === 'invoice' && (
              <div>
                <Label className="text-xs">Fecha de Vencimiento</Label>
                <Input type="date" value={form.due_date} onChange={(e) => update('due_date', e.target.value)} className="mt-1" />
              </div>
            )}
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={form.status} onValueChange={(value) => update('status', value)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {type === 'invoice' ? (
                    <>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="paid">Pagada</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="approved">Aprobada</SelectItem>
                      <SelectItem value="rejected">Rechazada</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Seleccionar Cliente</Label>
              <Select value={form.client_id || '_manual'} onValueChange={handleClientSelect}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Buscar cliente..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_manual">— Ingresar manualmente —</SelectItem>
                  {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nombre del Cliente</Label>
              <Input value={form.client_name} onChange={(e) => update('client_name', e.target.value)} className="mt-1" placeholder="Nombre completo" />
            </div>
            <div>
              <Label className="text-xs">Email del Cliente</Label>
              <Input value={form.client_email} onChange={(e) => update('client_email', e.target.value)} className="mt-1" placeholder="email@cliente.com" type="email" />
            </div>
            <div>
              <Label className="text-xs">Teléfono del Cliente</Label>
              <Input value={form.client_phone} onChange={(e) => update('client_phone', e.target.value)} className="mt-1" placeholder="+1 809 000 0000" type="tel" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
              Productos / Servicios
            </Label>
            <LineItemsTable
              items={form.line_items}
              onChange={(items) => update('line_items', items)}
              products={products}
              inventoryItems={inventoryItems}
            />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
              Cargos adicionales
            </Label>
            <AdditionalChargesEditor
              charges={form.additional_charges}
              onChange={(charges) => update('additional_charges', charges)}
            />
          </div>

          <TotalsPanel
            subtotal={subtotal}
            additionalCharges={additionalCharges}
            additionalChargesTotal={additionalChargesTotal}
            subtotalBeforeTax={subtotalBeforeTax}
            taxEnabled={form.tax_enabled}
            taxPct={form.tax_pct}
            onTaxEnabledChange={(value) => update('tax_enabled', value)}
            onTaxPctChange={(value) => update('tax_pct', value)}
          />

          <div>
            <Label className="text-xs">Notas / Condiciones</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              className="mt-1"
              rows={2}
              placeholder={type === 'quote' ? 'Esta cotización es válida por 30 días.' : 'Gracias por su preferencia...'}
            />
            {type === 'quote' && !form.notes && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Se mostrará automáticamente: "Esta cotización es válida por 30 días."
              </p>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-dashed border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Anexos comerciales</Label>
                <h3 className="mt-1 text-base font-semibold">Anexos Comerciales</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjunta imágenes, renders, mockups, propuestas, catálogos y material de apoyo para tus clientes.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {attachmentUploadState.isUploading ? (
                  <div className="rounded-full border bg-white px-3 py-1 text-xs text-muted-foreground">
                    Subiendo {attachmentUploadState.completed}/{attachmentUploadState.total}
                  </div>
                ) : null}
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleAttachmentFilesSelected}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={attachmentUploadState.isUploading}
                >
                  {attachmentUploadState.isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                  Agregar anexo
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_280px] md:items-start">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Formatos permitidos: JPG, PNG, WebP. Tamaño máximo inicial: 5MB por imagen.
                </p>
                <p className="text-xs text-muted-foreground">
                  Estas imágenes se incluirán al final del PDF como anexos comerciales.
                </p>
                <p className="text-xs font-medium text-foreground">
                  {visualAttachments.length} anexo{visualAttachments.length === 1 ? '' : 's'} agregado{visualAttachments.length === 1 ? '' : 's'}
                </p>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Diseño de anexos</Label>
                <Select
                  value={form.commercial_attachments_layout || DEFAULT_COMMERCIAL_ATTACHMENT_LAYOUT}
                  onValueChange={(value) => update('commercial_attachments_layout', value)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecciona un diseño" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMERCIAL_ATTACHMENT_LAYOUT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Diseño activo: {commercialAttachmentLayoutLabel}
                </p>
              </div>
            </div>

            {visualAttachments.length === 0 ? (
              <div className="rounded-xl border bg-white/70 px-4 py-8 text-center text-sm text-muted-foreground">
                Aún no has agregado anexos comerciales para este documento.
              </div>
            ) : (
              <DragDropContext onDragEnd={handleAttachmentDragEnd}>
                <Droppable droppableId="commercial-attachments">
                  {(dropProvided) => (
                    <div
                      ref={dropProvided.innerRef}
                      {...dropProvided.droppableProps}
                      className="grid gap-3"
                    >
                      {visualAttachments.map((attachment, index) => (
                        <Draggable key={attachment.id} draggableId={attachment.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`rounded-xl border bg-white p-3 shadow-sm transition-shadow ${dragSnapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
                            >
                              <div className="grid gap-4 lg:grid-cols-[auto_140px_1fr_auto]">
                                <div className="flex items-start">
                                  <button
                                    type="button"
                                    aria-label={`Mover anexo ${index + 1}`}
                                    className="mt-1 rounded-lg border bg-white p-2 text-muted-foreground hover:text-foreground"
                                    {...dragProvided.dragHandleProps}
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  className="group overflow-hidden rounded-lg border bg-muted/20"
                                  onClick={() => openAttachmentPreview(attachment)}
                                >
                                  {attachmentPreviewUrls[attachment.id] ? (
                                    <img
                                      src={attachmentPreviewUrls[attachment.id]}
                                      alt={attachment.title || `Anexo comercial ${index + 1}`}
                                      className="h-32 w-full object-cover transition-transform group-hover:scale-[1.02]"
                                    />
                                  ) : (
                                    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                                      Miniatura privada
                                    </div>
                                  )}
                                </button>

                                <div className="space-y-3">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                      <Label className="text-xs">Título</Label>
                                      <Input
                                        className="mt-1"
                                        value={attachment.title || ''}
                                        onChange={(event) => {
                                          const nextAttachments = visualAttachments.map((item) => (
                                            item.id === attachment.id ? { ...item, title: event.target.value } : item
                                          ));
                                          updateVisualAttachments(nextAttachments);
                                        }}
                                        placeholder="Aplicación en termos"
                                      />
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                                      <div>
                                        <p className="text-sm font-medium">Incluir en PDF</p>
                                        <p className="text-xs text-muted-foreground">Si lo apagas, se guarda pero no sale en la exportación.</p>
                                      </div>
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-primary"
                                        checked={attachment.include_in_pdf !== false}
                                        onChange={(event) => {
                                          const nextAttachments = visualAttachments.map((item) => (
                                            item.id === attachment.id ? { ...item, include_in_pdf: event.target.checked } : item
                                          ));
                                          updateVisualAttachments(nextAttachments);
                                        }}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <Label className="text-xs">Descripción</Label>
                                    <Textarea
                                      className="mt-1 min-h-[84px]"
                                      value={attachment.description || ''}
                                      onChange={(event) => {
                                        const nextAttachments = visualAttachments.map((item) => (
                                          item.id === attachment.id ? { ...item, description: event.target.value } : item
                                        ));
                                        updateVisualAttachments(nextAttachments);
                                      }}
                                      placeholder="Detalles del diseño, materiales, acabados o instrucciones del anexo."
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-row gap-2 lg:flex-col">
                                  <Button type="button" variant="outline" size="icon" onClick={() => openAttachmentPreview(attachment)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button type="button" variant="outline" size="icon" className="text-red-600 hover:text-red-700" onClick={() => removeAttachment(attachment.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {dropProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setShowPreview(true)}>
              <Eye className="h-4 w-4 mr-2" />
              Vista Previa
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </Card>
      </motion.div>

      {showPreview && (
        <PreviewModal
          document={previewData}
          type={type}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
