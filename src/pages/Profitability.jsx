import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  FlaskConical,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteOwnedRowById,
  extractMissingColumnFromError,
  fetchOwnedRows,
  hasOwnerConstraintIssue,
  isMissingColumnError,
  updateOwnedRowById,
} from '@/lib/supabaseOwnership';
import { calculateProfitability } from '@/lib/profitabilityCalculations';
import { listCostLibraryItems } from '@/lib/costLibrary';
import {
  calculateLibraryItemUnitCost,
  normalizeCostLibraryItem,
} from '@/lib/costLibraryTypes';

const ANALYSIS_TABLE = 'product_analysis';
const ONBOARDING_AUDIT_SEED_KEY = 'ceo_onboarding_audit_seed';
const PRODUCT_TYPES = [
  { value: 'fisico', label: '📦 Físico' },
  { value: 'digital', label: '💻 Digital' },
  { value: 'servicio', label: '🛠 Servicio' },
];

const COST_LINE_TABLE = 'profitability_cost_lines';
const PROFITABILITY_DRAFT_KEY = 'ceo_profitability_phase6_draft';
const LIBRARY_MODE = 'library';
const MANUAL_MODE = 'manual';
const MIXED_MODE = 'mixed';

const PHYSICAL_LIBRARY_SECTIONS = {
  materials: {
    title: 'Materiales e insumos',
    category: 'material',
    emptyText: 'Selecciona materiales de tu biblioteca.',
    addLabel: 'Agregar material',
  },
  packaging: {
    title: 'Empaque',
    category: 'empaque',
    emptyText: 'Selecciona empaques de tu biblioteca.',
    addLabel: 'Agregar empaque',
  },
  labor: {
    title: 'Mano de obra / procesos',
    category: 'proceso_mano_obra',
    emptyText: 'Selecciona procesos de mano de obra.',
    addLabel: 'Agregar proceso',
  },
};

const PRODUCT_TYPE_CONFIG = {
  fisico: {
    nameLabel: 'Nombre del Producto',
    namePlaceholder: 'Ej: Caja de regalo premium',
    priceLabel: 'Precio de Venta',
    priceHint: 'Lo que cobras por unidad',
    fields: {
      materials: {
        label: 'Materiales e insumos',
        hint: 'Costo directo para producir una unidad',
      },
      hidden: {
        label: 'Empaque, merma y envíos',
        hint: 'Gastos físicos que suelen quedarse fuera',
      },
      time: {
        label: 'Tiempo de producción',
        hint: 'Horas necesarias por unidad',
      },
      hourly: {
        label: 'Costo de mano de obra por hora',
        hint: 'Valor real de tu tiempo o de tu equipo',
      },
      commission: {
        label: 'Comisiones e impuestos',
        hint: '% de pasarela, marketplace o impuestos por venta',
      },
      ads: {
        label: 'Ads por unidad vendida',
        hint: 'Costo promedio de adquisición por venta',
      },
    },
    breakEvenUnit: 'und.',
    itemNoun: 'producto',
  },
  digital: {
    nameLabel: 'Nombre del Producto Digital',
    namePlaceholder: 'Ej: Curso de Marketing Digital',
    priceLabel: 'Precio de Venta',
    priceHint: 'Lo que cobras por acceso, descarga o licencia',
    fields: {
      materials: {
        label: 'Plataformas y herramientas',
        hint: 'Hosting, LMS, licencias o software prorrateado por venta',
      },
      hidden: {
        label: 'Soporte y actualizaciones',
        hint: 'Costo estimado de acompañamiento, comunidad o mejoras',
      },
      time: {
        label: 'Tiempo por cliente',
        hint: 'Horas de soporte, onboarding o entrega por venta',
      },
      hourly: {
        label: 'Valor hora de soporte',
        hint: 'Costo de tu tiempo o del equipo que atiende al cliente',
      },
      commission: {
        label: 'Plataforma/pasarela',
        hint: '% que retiene Hotmart, Stripe, PayPal u otra plataforma',
      },
      ads: {
        label: 'Ads por venta digital',
        hint: 'Costo de adquisición por comprador',
      },
    },
    breakEvenUnit: 'ventas',
    itemNoun: 'producto digital',
  },
  servicio: {
    nameLabel: 'Nombre del Servicio',
    namePlaceholder: 'Ej: Sesión de consultoría estratégica',
    priceLabel: 'Honorario del Servicio',
    priceHint: 'Lo que cobras por entrega, sesión o proyecto',
    fields: {
      materials: {
        label: 'Insumos y subcontratos',
        hint: 'Herramientas, freelancers o recursos usados en la entrega',
      },
      hidden: {
        label: 'Traslados y gastos operativos',
        hint: 'Gastos administrativos, viáticos o coordinación',
      },
      time: {
        label: 'Horas de ejecución',
        hint: 'Tiempo total que toma entregar el servicio',
      },
      hourly: {
        label: 'Valor hora profesional',
        hint: 'Costo real de tu hora o del equipo asignado',
      },
      commission: {
        label: 'Impuestos/comisiones',
        hint: '% retenido por impuestos, referidos o pasarela',
      },
      ads: {
        label: 'Captación por cliente',
        hint: 'Costo comercial para conseguir ese servicio',
      },
    },
    breakEvenUnit: 'clientes',
    itemNoun: 'servicio',
  },
};

function toNumber(value) {
  return Number(value || 0);
}

function toSafeNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeStatus(status) {
  const current = `${status || 'analysis'}`.toLowerCase();
  if (current === 'analysis') return 'analysis';
  if (current === 'approved') return 'approved';
  if (current === 'active') return 'active';
  if (current === 'synced') return 'synced';
  if (current === 'en_analisis') return 'en_analisis';
  return 'analysis';
}

function normalizeAnalysisRecord(row) {
  return {
    id: row.id,
    name: row.name || row.product_name || 'Producto sin nombre',
    sale_price: toNumber(row.sale_price),
    cost: toNumber(row.cost ?? row.costo_unitario),
    margin_pct: toNumber(row.margin_pct),
    product_type: row.product_type || 'fisico',
    status: normalizeStatus(row.status),
    created_at: row.created_at || null,
  };
}

function formatPreciseMoney(value, formatMoney) {
  const amount = toSafeNumber(value);
  if (Number.isInteger(amount)) return formatMoney(amount);

  return formatMoney(amount).replace(/\d+(?:[.,]\d+)?/, amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }));
}

function getReferenceCost(item, formatMoney) {
  const normalized = normalizeCostLibraryItem(item);
  const result = calculateLibraryItemUnitCost(normalized, {
    quantity: 1,
    hours: 1,
    salePrice: 100,
  });

  if (normalized.calculationType === 'per_unit') {
    return `${formatPreciseMoney(result.computedAmount, formatMoney)} por ${normalized.usageUnit || 'unidad'}`;
  }

  if (normalized.calculationType === 'hourly') {
    return `${formatMoney(result.computedAmount)} por hora`;
  }

  return formatMoney(result.computedAmount);
}

function createCostLine(item, section) {
  const normalized = normalizeCostLibraryItem(item);
  return {
    lineId: `${section}:${normalized.id}`,
    section,
    item: normalized,
    quantity: '1',
    minutes: normalized.calculationType === 'hourly' ? '60' : '',
    wastePercentageOverride: `${normalized.wastePercentage || 0}`,
  };
}

function getLineHours(line) {
  if (line?.item?.calculationType !== 'hourly') return 0;
  return toSafeNumber(line.minutes) / 60;
}

function getLineWastePercentage(line) {
  if (`${line?.wastePercentageOverride ?? ''}`.trim() === '') {
    return toSafeNumber(line?.item?.wastePercentage);
  }

  return toSafeNumber(line.wastePercentageOverride);
}

function calculateCostLine(line, salePrice = 0) {
  const normalized = normalizeCostLibraryItem(line.item);
  return calculateLibraryItemUnitCost(normalized, {
    quantity: toSafeNumber(line.quantity || 1),
    hours: normalized.calculationType === 'hourly' ? getLineHours(line) : 1,
    salePrice,
    wastePercentageOverride: getLineWastePercentage(line),
  });
}

function summarizeCostLines(lines = [], salePrice = 0) {
  return lines.reduce((summary, line) => {
    const result = calculateCostLine(line, salePrice);
    return {
      baseAmount: summary.baseAmount + result.baseAmount,
      wasteAmount: summary.wasteAmount + result.wasteAmount,
      computedAmount: summary.computedAmount + result.computedAmount,
    };
  }, {
    baseAmount: 0,
    wasteAmount: 0,
    computedAmount: 0,
  });
}

function buildCostLinePayloads({
  linesBySection,
  productAnalysisId,
  ownerId,
  ownerEmail,
  salePrice,
}) {
  const orderedLines = [
    ...linesBySection.materials,
    ...linesBySection.packaging,
    ...linesBySection.labor,
  ];

  return orderedLines.map((line, index) => {
    const item = normalizeCostLibraryItem(line.item);
    const result = calculateCostLine(line, salePrice);
    const unitResult = calculateLibraryItemUnitCost(item, {
      quantity: 1,
      hours: 1,
      salePrice,
      wastePercentageOverride: getLineWastePercentage(line),
    });

    return {
      user_id: ownerId,
      created_by: ownerEmail || null,
      product_analysis_id: productAnalysisId,
      cost_library_item_id: item.id,
      name_snapshot: item.name,
      description_snapshot: item.description || null,
      category_snapshot: item.category,
      calculation_type_snapshot: item.calculationType,
      usage_unit_snapshot: item.usageUnit || null,
      quantity: item.calculationType === 'hourly' ? 0 : toSafeNumber(line.quantity || 1),
      hours: item.calculationType === 'hourly' ? getLineHours(line) : 0,
      sale_price_basis: salePrice,
      percentage_rate_snapshot: item.percentageRate,
      fixed_fee_snapshot: item.fixedFee,
      waste_percentage_snapshot: getLineWastePercentage(line),
      unit_cost_snapshot: unitResult.computedAmount,
      base_amount: result.baseAmount,
      waste_amount: result.wasteAmount,
      computed_amount: result.computedAmount,
      sort_order: index,
    };
  });
}

export default function Profitability() {
  const location = useLocation();
  const { formatMoney, currency } = useCurrency();
  const { user, userProfile, isAdmin } = useAuth();
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;
  const moneyUnit = currency || 'USD';

  const [isLoadingPanel, setIsLoadingPanel] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisRows, setAnalysisRows] = useState([]);
  const [analysisSource, setAnalysisSource] = useState(ANALYSIS_TABLE);
  const [targetMargin, setTargetMargin] = useState(40);
  const [seedApplied, setSeedApplied] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'fisico',
    price: '',
    materials: '',
    hidden: '',
    time: '',
    hourly: '',
    commission: '',
    ads: '',
  });
  const [physicalModes, setPhysicalModes] = useState({
    materials: MANUAL_MODE,
    packaging: MANUAL_MODE,
    labor: MANUAL_MODE,
  });
  const [physicalCostLines, setPhysicalCostLines] = useState({
    materials: [],
    packaging: [],
    labor: [],
  });
  const [selector, setSelector] = useState({
    open: false,
    section: 'materials',
    search: '',
  });
  const [libraryItems, setLibraryItems] = useState([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [deleteLineTarget, setDeleteLineTarget] = useState(null);
  const typeConfig = PRODUCT_TYPE_CONFIG[form.type] || PRODUCT_TYPE_CONFIG.fisico;
  const fieldConfig = typeConfig.fields;
  const isPhysical = form.type === 'fisico';
  const materialSummary = useMemo(
    () => summarizeCostLines(physicalCostLines.materials, toSafeNumber(form.price)),
    [physicalCostLines.materials, form.price]
  );
  const packagingSummary = useMemo(
    () => summarizeCostLines(physicalCostLines.packaging, toSafeNumber(form.price)),
    [physicalCostLines.packaging, form.price]
  );
  const laborSummary = useMemo(
    () => summarizeCostLines(physicalCostLines.labor, toSafeNumber(form.price)),
    [physicalCostLines.labor, form.price]
  );
  const isMaterialsLibraryActive = isPhysical && (
    physicalModes.materials === LIBRARY_MODE || physicalModes.materials === MIXED_MODE
  );
  const isPackagingLibraryActive = isPhysical && (
    physicalModes.packaging === LIBRARY_MODE || physicalModes.packaging === MIXED_MODE
  );
  const isLaborLibraryActive = isPhysical && (
    physicalModes.labor === LIBRARY_MODE || physicalModes.labor === MIXED_MODE
  );
  const usesLibraryLines = isPhysical && (
    isMaterialsLibraryActive ||
    isPackagingLibraryActive ||
    isLaborLibraryActive
  );
  const manualLaborCost = toSafeNumber(form.time) * toSafeNumber(form.hourly);
  const manualMaterialsCost = toSafeNumber(form.materials);
  const manualAdditionalCost = toSafeNumber(form.hidden);
  const effectiveMaterialsCost = isMaterialsLibraryActive
    ? materialSummary.computedAmount + (physicalModes.materials === MIXED_MODE ? manualMaterialsCost : 0)
    : form.materials;
  const effectiveAdditionalCost = isPackagingLibraryActive
    ? packagingSummary.computedAmount + (physicalModes.packaging === MIXED_MODE ? manualAdditionalCost : 0)
    : form.hidden;
  const effectiveLaborCost = isLaborLibraryActive
    ? laborSummary.computedAmount + (physicalModes.labor === MIXED_MODE ? manualLaborCost : 0)
    : null;

  const {
    price,
    materialsCost,
    additionalCost,
    adsCost,
    laborCost,
    commissionCost,
    totalCost,
    profit,
    margin,
    breakEvenUnits,
    recommendedPrice,
  } = calculateProfitability({
    price: form.price,
    materialsCost: effectiveMaterialsCost,
    additionalCost: effectiveAdditionalCost,
    time: form.time,
    hourly: form.hourly,
    laborCost: effectiveLaborCost,
    commission: form.commission,
    ads: form.ads,
    targetMargin,
    productType: form.type,
  });
  const selectedLibraryLineCount = isPhysical
    ? (physicalModes.materials === MANUAL_MODE ? 0 : physicalCostLines.materials.length) +
      (physicalModes.packaging === MANUAL_MODE ? 0 : physicalCostLines.packaging.length) +
      (physicalModes.labor === MANUAL_MODE ? 0 : physicalCostLines.labor.length)
    : 0;
  const isAuditStarted = price > 0 ||
    toSafeNumber(form.materials) > 0 ||
    toSafeNumber(form.hidden) > 0 ||
    toSafeNumber(form.time) > 0 ||
    toSafeNumber(form.hourly) > 0 ||
    toSafeNumber(form.commission) > 0 ||
    toSafeNumber(form.ads) > 0 ||
    selectedLibraryLineCount > 0;

  const verdict = useMemo(() => {
    if (!isAuditStarted) {
      return {
        tone: 'neutral',
        title: 'Realiza tu auditoría de rentabilidad',
        text: 'Completa los datos de tu producto para calcular tus costos, margen y recibir un veredicto financiero.',
        helper: 'Empieza ingresando el precio de venta y los costos relacionados.',
      };
    }

    if (margin < 20) {
      return {
        tone: 'danger',
        title: 'VEREDICTO FINANCIERO',
        text: `Atención: este ${typeConfig.itemNoun} deja poco dinero. Ajusta el precio o reduce costos.`,
      };
    }
    if (margin < 35) {
      return {
        tone: 'warning',
        title: 'VEREDICTO FINANCIERO',
        text: 'Rentabilidad media: hay espacio de mejora para escalar con más margen.',
      };
    }
    return {
      tone: 'success',
      title: 'VEREDICTO FINANCIERO',
      text: `Excelente margen. Este ${typeConfig.itemNoun} es sólido para escalar.`,
    };
  }, [isAuditStarted, margin, typeConfig.itemNoun]);

  const loadAnalysis = async (preferredSource = analysisSource) => {
    if (!adminMode && !ownerId && !ownerEmail) {
      setAnalysisRows([]);
      setIsLoadingPanel(false);
      return;
    }

    setIsLoadingPanel(true);
    try {
      const sourceOrder = preferredSource === 'products'
        ? ['products', ANALYSIS_TABLE]
        : [ANALYSIS_TABLE, 'products'];

      let lastError = null;
      let emptyResult = null;

      for (const source of sourceOrder) {
        try {
          const rows = await fetchOwnedRows({
            table: source,
            ownerId,
            ownerEmail,
            adminMode,
            orderBy: 'created_at',
            ascending: false,
          });
          const normalized = rows
            .map(normalizeAnalysisRecord)
            .filter((row) => (
              source === ANALYSIS_TABLE
                ? (row.status === 'analysis' || row.status === 'approved')
                : (row.status === 'analysis' || row.status === 'approved' || row.status === 'en_analisis')
            ));

          if (!emptyResult) {
            emptyResult = { source, rows: normalized };
          }

          if (normalized.length > 0) {
            setAnalysisSource(source);
            setAnalysisRows(normalized);
            return;
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (emptyResult) {
        setAnalysisSource(emptyResult.source);
        setAnalysisRows(emptyResult.rows);
        return;
      }

      if (lastError) {
        throw lastError;
      }
    } catch (error) {
      toast.error(`No se pudo cargar análisis: ${error.message}`);
      setAnalysisRows([]);
    } finally {
      setIsLoadingPanel(false);
    }
  };

  useEffect(() => {
    loadAnalysis(analysisSource);
  }, [ownerId, ownerEmail, adminMode]);

  useEffect(() => {
    if (!selector.open) return;

    const sectionConfig = PHYSICAL_LIBRARY_SECTIONS[selector.section];
    if (!sectionConfig) return;

    let ignore = false;
    const timeout = window.setTimeout(async () => {
      setIsLibraryLoading(true);
      setLibraryError('');
      try {
        const rows = await listCostLibraryItems({
          category: sectionConfig.category,
          productType: 'fisico',
          isActive: true,
          search: selector.search,
          orderBy: 'name',
          ascending: true,
        });
        if (!ignore) {
          setLibraryItems(rows);
        }
      } catch (error) {
        if (!ignore) {
          setLibraryItems([]);
          setLibraryError(error.message || 'No se pudo cargar la biblioteca');
        }
      } finally {
        if (!ignore) {
          setIsLibraryLoading(false);
        }
      }
    }, 250);

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
    };
  }, [selector.open, selector.section, selector.search]);

  useEffect(() => {
    if (seedApplied || typeof window === 'undefined') return;

    const stateSeed = location?.state?.onboardingAuditSeed;
    if (stateSeed && typeof stateSeed === 'object') {
      setForm((prev) => ({
        ...prev,
        name: stateSeed.name || prev.name,
        type: stateSeed.type || prev.type,
        price: stateSeed.price || prev.price,
        materials: stateSeed.materials || prev.materials,
        hidden: stateSeed.hidden || prev.hidden,
        time: stateSeed.time || prev.time,
        hourly: stateSeed.hourly || prev.hourly,
        commission: stateSeed.commission || prev.commission,
        ads: stateSeed.ads || prev.ads,
      }));

      setSeedApplied(true);
      setDraftRestored(true);
      toast.success('Producto cargado desde onboarding. Completa los datos de auditoría y guarda en análisis.');
      if (location?.state?.onboardingWarning) {
        toast.warning(`Continuamos con guardado parcial: ${location.state.onboardingWarning}`);
      }
      return;
    }

    const normalizedEmail = `${ownerEmail || ''}`.trim().toLowerCase();
    const candidateKeys = [
      ownerId ? `${ONBOARDING_AUDIT_SEED_KEY}:${ownerId}` : null,
      normalizedEmail ? `${ONBOARDING_AUDIT_SEED_KEY}:${normalizedEmail}` : null,
      ONBOARDING_AUDIT_SEED_KEY,
    ].filter(Boolean);

    let parsedSeed = null;
    let matchedKey = null;

    for (const key of candidateKeys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          parsedSeed = parsed;
          matchedKey = key;
          break;
        }
      } catch {
        window.localStorage.removeItem(key);
      }
    }

    if (!parsedSeed) {
      setSeedApplied(true);
      return;
    }

    setForm((prev) => ({
      ...prev,
      name: parsedSeed.name || prev.name,
      type: parsedSeed.type || prev.type,
      price: parsedSeed.price || prev.price,
      materials: parsedSeed.materials || prev.materials,
      hidden: parsedSeed.hidden || prev.hidden,
      time: parsedSeed.time || prev.time,
      hourly: parsedSeed.hourly || prev.hourly,
      commission: parsedSeed.commission || prev.commission,
      ads: parsedSeed.ads || prev.ads,
    }));

    if (matchedKey) {
      window.localStorage.removeItem(matchedKey);
    }
    for (const key of candidateKeys) {
      window.localStorage.removeItem(key);
    }

    setSeedApplied(true);
    setDraftRestored(true);
    toast.success('Producto cargado desde onboarding. Completa los datos de auditoría y guarda en análisis.');
  }, [seedApplied, ownerId, ownerEmail, location?.state]);

  useEffect(() => {
    if (!seedApplied || draftRestored || typeof window === 'undefined') return;

    const raw = window.sessionStorage.getItem(PROFITABILITY_DRAFT_KEY);
    if (!raw) {
      setDraftRestored(true);
      return;
    }

    try {
      const draft = JSON.parse(raw);
      if (draft?.form) {
        setForm((prev) => ({ ...prev, ...draft.form }));
      }
      if (draft?.physicalModes) {
        setPhysicalModes((prev) => ({ ...prev, ...draft.physicalModes }));
      }
      if (draft?.physicalCostLines) {
        setPhysicalCostLines((prev) => ({ ...prev, ...draft.physicalCostLines }));
      }
    } catch {
      window.sessionStorage.removeItem(PROFITABILITY_DRAFT_KEY);
    } finally {
      setDraftRestored(true);
    }
  }, [seedApplied, draftRestored]);

  useEffect(() => {
    if (!draftRestored || typeof window === 'undefined') return;

    window.sessionStorage.setItem(PROFITABILITY_DRAFT_KEY, JSON.stringify({
      form,
      physicalModes,
      physicalCostLines,
    }));
  }, [draftRestored, form, physicalModes, physicalCostLines]);

  const insertWithAdaptiveFallback = async (tableName, payload, attempt = 0) => {
    if (attempt > 12) {
      throw new Error(`No se pudo guardar en ${tableName} después de varios intentos.`);
    }

    const { data, error } = await supabase
      .from(tableName)
      .insert(payload)
      .select()
      .single();

    if (!error) return data;

    if (hasOwnerConstraintIssue(error, tableName) && Object.prototype.hasOwnProperty.call(payload, 'user_id')) {
      const next = { ...payload };
      delete next.user_id;
      return insertWithAdaptiveFallback(tableName, next, attempt + 1);
    }

    if (
      isMissingColumnError(error, `${tableName}.user_id`) ||
      isMissingColumnError(error, 'user_id') ||
      isMissingColumnError(error, `${tableName}.created_by`) ||
      isMissingColumnError(error, 'created_by')
    ) {
      const next = { ...payload };
      delete next.user_id;
      delete next.created_by;
      return insertWithAdaptiveFallback(tableName, next, attempt + 1);
    }

    const missingColumn = extractMissingColumnFromError(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      const next = { ...payload };
      delete next[missingColumn];
      return insertWithAdaptiveFallback(tableName, next, attempt + 1);
    }

    throw error;
  };

  const insertOwnedProduct = async (payload) => {
    const withOwner = { ...payload, user_id: ownerId, created_by: ownerEmail || null };
    return insertWithAdaptiveFallback('products', withOwner);
  };

  const insertOwnedAnalysis = async (payload) => {
    const withOwner = { ...payload, user_id: ownerId, created_by: ownerEmail || null };
    return insertWithAdaptiveFallback(ANALYSIS_TABLE, withOwner);
  };

  const insertCostLineSnapshots = async (productAnalysisId, linePayloads) => {
    if (!linePayloads.length) return [];

    const { data, error } = await supabase
      .from(COST_LINE_TABLE)
      .insert(linePayloads)
      .select('id');

    if (error) {
      throw new Error(`Análisis guardado, pero no se pudieron guardar las líneas de biblioteca: ${error.message}`);
    }

    return data || [];
  };

  const setPhysicalMode = (section, mode) => {
    setPhysicalModes((prev) => ({
      ...prev,
      [section]: mode,
    }));
  };

  const openCostSelector = (section) => {
    setSelector({
      open: true,
      section,
      search: '',
    });
  };

  const closeCostSelector = () => {
    setSelector((prev) => ({
      ...prev,
      open: false,
    }));
  };

  const addLibraryLine = (item) => {
    const section = selector.section;
    setPhysicalCostLines((prev) => {
      const exists = prev[section].some((line) => line.item.id === item.id);
      if (exists) return prev;

      return {
        ...prev,
        [section]: [...prev[section], createCostLine(item, section)],
      };
    });
  };

  const updateLibraryLine = (section, lineId, changes) => {
    setPhysicalCostLines((prev) => ({
      ...prev,
      [section]: prev[section].map((line) => (
        line.lineId === lineId ? { ...line, ...changes } : line
      )),
    }));
  };

  const removeLibraryLine = (section, lineId) => {
    setPhysicalCostLines((prev) => ({
      ...prev,
      [section]: prev[section].filter((line) => line.lineId !== lineId),
    }));
    setDeleteLineTarget(null);
  };

  const selectedLibraryIds = useMemo(() => {
    const current = physicalCostLines[selector.section] || [];
    return new Set(current.map((line) => line.item.id));
  }, [physicalCostLines, selector.section]);

  const activeLibraryLinesBySection = useMemo(() => {
    if (!usesLibraryLines) {
      return { materials: [], packaging: [], labor: [] };
    }

    return {
      materials: physicalModes.materials === MANUAL_MODE ? [] : physicalCostLines.materials,
      packaging: physicalModes.packaging === MANUAL_MODE ? [] : physicalCostLines.packaging,
      labor: physicalModes.labor === MANUAL_MODE ? [] : physicalCostLines.labor,
    };
  }, [physicalCostLines, physicalModes, usesLibraryLines]);

  const saveToAnalysis = async () => {
    if (!form.name.trim()) {
      toast.error('Escribe el nombre del producto');
      return;
    }

    if (price <= 0) {
      toast.error('Ingresa un precio de venta válido');
      return;
    }

    const payload = {
      name: form.name.trim(),
      sale_price: price,
      cost: totalCost,
      margin_pct: margin,
      product_type: form.type,
      status: 'analysis',
    };
    const costLinePayloads = usesLibraryLines
      ? buildCostLinePayloads({
        linesBySection: activeLibraryLinesBySection,
        productAnalysisId: null,
        ownerId,
        ownerEmail,
        salePrice: price,
      })
      : [];

    setIsSaving(true);
    try {
      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de guardar análisis:', profileError?.message || profileError);
        }
      }

      let savedRow = null;
      let nextSource = analysisSource;

      if (analysisSource === ANALYSIS_TABLE) {
        try {
          savedRow = await insertOwnedAnalysis(payload);
        } catch (analysisError) {
          if (costLinePayloads.length > 0) {
            throw new Error(analysisError?.message || 'No se pudo guardar el análisis con líneas de biblioteca');
          }
          try {
            savedRow = await insertOwnedProduct({
              name: payload.name,
              sale_price: payload.sale_price,
              costo_unitario: payload.cost,
              margin_pct: payload.margin_pct,
              product_type: payload.product_type,
              status: 'en_analisis',
            });
            nextSource = 'products';
            setAnalysisSource('products');
          } catch (productError) {
            throw new Error(productError?.message || analysisError?.message || 'No se pudo guardar el análisis');
          }
        }
      } else {
        savedRow = await insertOwnedProduct({
          name: payload.name,
          sale_price: payload.sale_price,
          costo_unitario: payload.cost,
          margin_pct: payload.margin_pct,
          product_type: payload.product_type,
          status: 'en_analisis',
        });
      }

      if (savedRow?.id && nextSource === ANALYSIS_TABLE && costLinePayloads.length > 0) {
        const snapshots = costLinePayloads.map((line) => ({
          ...line,
          product_analysis_id: savedRow.id,
        }));
        await insertCostLineSnapshots(savedRow.id, snapshots);
      }

      if (savedRow?.id) {
        const normalized = normalizeAnalysisRecord(savedRow);
        const canShow =
          normalized.status === 'analysis' ||
          normalized.status === 'approved' ||
          normalized.status === 'en_analisis';

        if (canShow) {
          setAnalysisRows((prev) => {
            const next = [normalized, ...prev.filter((row) => row.id !== normalized.id)];
            return next;
          });
        }
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(PROFITABILITY_DRAFT_KEY);
      }
      toast.success('Guardado en análisis');
      if (nextSource !== analysisSource) {
        await loadAnalysis(nextSource);
        return;
      }
      await loadAnalysis(analysisSource);
    } catch (error) {
      toast.error(`Error al guardar: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const approveItem = async (id) => {
    try {
      const table = analysisSource === ANALYSIS_TABLE ? ANALYSIS_TABLE : 'products';
      const nextStatus = table === ANALYSIS_TABLE ? 'approved' : 'en_analisis';
      await updateOwnedRowById({
        table,
        id,
        payload: { status: nextStatus },
        ownerId,
        ownerEmail,
        adminMode,
      });
      toast.success('Producto aprobado para sincronización');
      await loadAnalysis();
    } catch (error) {
      toast.error(`No se pudo aprobar: ${error.message}`);
    }
  };

  const syncItem = async (item) => {
    try {
      if (analysisSource === ANALYSIS_TABLE) {
        await insertOwnedProduct({
          name: item.name,
          sale_price: item.sale_price,
          costo_unitario: item.cost,
          margin_pct: item.margin_pct,
          product_type: item.product_type,
          status: 'active',
        });
        await updateOwnedRowById({
          table: ANALYSIS_TABLE,
          id: item.id,
          payload: { status: 'synced' },
          ownerId,
          ownerEmail,
          adminMode,
        });
      } else {
        await updateOwnedRowById({
          table: 'products',
          id: item.id,
          payload: { status: 'active' },
          ownerId,
          ownerEmail,
          adminMode,
        });
      }

      toast.success('Sincronizado al catálogo');
      await loadAnalysis();
    } catch (error) {
      toast.error(`No se pudo sincronizar: ${error.message}`);
    }
  };

  const deleteItem = async (id) => {
    try {
      const table = analysisSource === ANALYSIS_TABLE ? ANALYSIS_TABLE : 'products';
      await deleteOwnedRowById({
        table,
        id,
        ownerId,
        ownerEmail,
        adminMode,
      });
      toast.success('Registro eliminado');
      await loadAnalysis();
    } catch (error) {
      toast.error(`No se pudo eliminar: ${error.message}`);
    }
  };

  if (isLoadingPanel) {
    return (
      <div className="flex items-center justify-center h-full min-h-[420px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1220px] mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-y-5 lg:gap-x-7 xl:gap-x-8 items-start">
        <Card className="order-1 lg:order-1 p-6 lg:p-7 rounded-2xl border border-[#E7E1D9] shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
          <p className="text-[11px] font-extrabold tracking-[0.12em] text-muted-foreground mb-5">DATOS DE AUDITORÍA</p>

          <div className="space-y-1.5 mb-4">
            <label className="text-xs font-semibold text-foreground">{typeConfig.nameLabel}</label>
            <Input
              className="h-12 rounded-xl"
              placeholder={typeConfig.namePlaceholder}
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>

          <div className="space-y-1.5 mb-5">
            <label className="text-xs font-semibold text-foreground">Tipo de Producto</label>
            <Select
              value={form.type}
              onValueChange={(value) => setForm((prev) => ({ ...prev, type: value }))}
            >
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isPhysical ? (
            <div className="space-y-4">
              <NumericField
                label={`${typeConfig.priceLabel} (${moneyUnit})`}
                hint={typeConfig.priceHint}
                value={form.price}
                onChange={(value) => setForm((prev) => ({ ...prev, price: value }))}
              />

              <PhysicalCostSection
                section="materials"
                title="Materiales e insumos"
                hint="Costo directo para producir una unidad."
                mode={physicalModes.materials}
                onModeChange={setPhysicalMode}
                manualField={(
                  <NumericField
                    label={`${fieldConfig.materials.label} (${moneyUnit})`}
                    hint={fieldConfig.materials.hint}
                    value={form.materials}
                    onChange={(value) => setForm((prev) => ({ ...prev, materials: value }))}
                  />
                )}
                lines={physicalCostLines.materials}
                summary={materialSummary}
                manualAmount={manualMaterialsCost}
                formatMoney={formatMoney}
                onOpenSelector={openCostSelector}
                onUpdateLine={updateLibraryLine}
                onRequestRemove={setDeleteLineTarget}
              />

              <PhysicalCostSection
                section="packaging"
                title="Empaque"
                hint="Puedes usar empaques de biblioteca y dejar envíos u otros gastos en el campo manual."
                mode={physicalModes.packaging}
                onModeChange={setPhysicalMode}
                manualField={(
                  <NumericField
                    label={`${fieldConfig.hidden.label} (${moneyUnit})`}
                    hint={fieldConfig.hidden.hint}
                    value={form.hidden}
                    onChange={(value) => setForm((prev) => ({ ...prev, hidden: value }))}
                  />
                )}
                lines={physicalCostLines.packaging}
                summary={packagingSummary}
                manualAmount={manualAdditionalCost}
                formatMoney={formatMoney}
                onOpenSelector={openCostSelector}
                onUpdateLine={updateLibraryLine}
                onRequestRemove={setDeleteLineTarget}
              />

              <PhysicalCostSection
                section="labor"
                title="Mano de obra / procesos"
                hint="Usa tiempo y valor hora manual, o procesos por hora desde biblioteca."
                mode={physicalModes.labor}
                onModeChange={setPhysicalMode}
                manualField={(
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NumericField
                      label={`${fieldConfig.time.label} (horas)`}
                      hint={fieldConfig.time.hint}
                      value={form.time}
                      onChange={(value) => setForm((prev) => ({ ...prev, time: value }))}
                    />
                    <NumericField
                      label={`${fieldConfig.hourly.label} (${moneyUnit})`}
                      hint={fieldConfig.hourly.hint}
                      value={form.hourly}
                      onChange={(value) => setForm((prev) => ({ ...prev, hourly: value }))}
                    />
                  </div>
                )}
                lines={physicalCostLines.labor}
                summary={laborSummary}
                manualAmount={manualLaborCost}
                formatMoney={formatMoney}
                onOpenSelector={openCostSelector}
                onUpdateLine={updateLibraryLine}
                onRequestRemove={setDeleteLineTarget}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumericField
                  label={`${fieldConfig.commission.label} (%)`}
                  hint={fieldConfig.commission.hint}
                  value={form.commission}
                  onChange={(value) => setForm((prev) => ({ ...prev, commission: value }))}
                />
                <NumericField
                  label={`${fieldConfig.ads.label} (${moneyUnit})`}
                  hint={fieldConfig.ads.hint}
                  value={form.ads}
                  onChange={(value) => setForm((prev) => ({ ...prev, ads: value }))}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumericField
                  label={`${typeConfig.priceLabel} (${moneyUnit})`}
                  hint={typeConfig.priceHint}
                  value={form.price}
                  onChange={(value) => setForm((prev) => ({ ...prev, price: value }))}
                />
                <NumericField
                  label={`${fieldConfig.materials.label} (${moneyUnit})`}
                  hint={fieldConfig.materials.hint}
                  value={form.materials}
                  onChange={(value) => setForm((prev) => ({ ...prev, materials: value }))}
                />
                <NumericField
                  label={`${fieldConfig.hidden.label} (${moneyUnit})`}
                  hint={fieldConfig.hidden.hint}
                  value={form.hidden}
                  onChange={(value) => setForm((prev) => ({ ...prev, hidden: value }))}
                />
                <NumericField
                  label={`${fieldConfig.time.label} (horas)`}
                  hint={fieldConfig.time.hint}
                  value={form.time}
                  onChange={(value) => setForm((prev) => ({ ...prev, time: value }))}
                />
                <NumericField
                  label={`${fieldConfig.hourly.label} (${moneyUnit})`}
                  hint={fieldConfig.hourly.hint}
                  value={form.hourly}
                  onChange={(value) => setForm((prev) => ({ ...prev, hourly: value }))}
                />
                <NumericField
                  label={`${fieldConfig.commission.label} (%)`}
                  hint={fieldConfig.commission.hint}
                  value={form.commission}
                  onChange={(value) => setForm((prev) => ({ ...prev, commission: value }))}
                />
              </div>

              <div className="mt-3">
                <NumericField
                  label={`${fieldConfig.ads.label} (${moneyUnit})`}
                  hint={fieldConfig.ads.hint}
                  value={form.ads}
                  onChange={(value) => setForm((prev) => ({ ...prev, ads: value }))}
                />
              </div>
            </>
          )}

          <Button
            className="w-full mt-4 h-12 rounded-xl bg-[#D45387] hover:bg-[#C24578] text-white"
            onClick={saveToAnalysis}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isSaving ? 'Guardando...' : 'Guardar en Análisis'}
          </Button>
        </Card>

        <div className="order-2 lg:order-2 space-y-4">
          <Card className="p-5 rounded-2xl border border-[#E7E1D9] shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <p className="text-[11px] font-extrabold tracking-[0.12em] text-muted-foreground mb-4">SIMULACIÓN EN TIEMPO REAL</p>

            <div className="grid grid-cols-2 gap-3">
              <MiniMetric
                label="GANANCIA POR VENTA"
                helper="Lo que realmente te queda por venta"
                value={formatMoney(profit)}
                valueClass={profit >= 0 ? 'text-foreground' : 'text-red-600'}
              />
              <MiniMetric
                label="MARGEN REAL (%)"
                helper="% que ganas sobre cada venta"
                value={`${margin.toFixed(1)}%`}
                valueClass={margin < 20 ? 'text-red-600' : 'text-foreground'}
              />
              <MiniMetric
                label="COSTO TOTAL"
                value={formatMoney(totalCost)}
              />
              <MiniMetric
                label="PUNTO EQUILIBRIO"
                value={`${breakEvenUnits} ${typeConfig.breakEvenUnit}`}
              />
            </div>
          </Card>

          {isPhysical ? (
            <Card className="p-5 rounded-2xl border border-[#E7E1D9] shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
              <p className="text-[11px] font-extrabold tracking-[0.12em] text-muted-foreground mb-4">DESGLOSE COSTO FÍSICO</p>
              <div className="space-y-2 text-sm">
                <CostBreakdownRow label="Materiales antes de merma" value={formatMoney(
                  isMaterialsLibraryActive ? materialSummary.baseAmount + (
                    physicalModes.materials === MIXED_MODE ? manualMaterialsCost : 0
                  ) : materialsCost
                )} />
                <CostBreakdownRow label="Merma" value={formatMoney(
                  isMaterialsLibraryActive ? materialSummary.wasteAmount : 0
                )} />
                <CostBreakdownRow label="Empaque" value={formatMoney(
                  isPackagingLibraryActive ? packagingSummary.computedAmount : additionalCost
                )} />
                <CostBreakdownRow label="Mano de obra" value={formatMoney(laborCost)} />
                <CostBreakdownRow label="Otros costos manuales" value={formatMoney(
                  physicalModes.packaging === MIXED_MODE ? manualAdditionalCost : 0
                )} />
                <CostBreakdownRow label="Ads" value={formatMoney(adsCost)} />
                <CostBreakdownRow label="Comisiones" value={formatMoney(commissionCost)} />
                <div className="border-t pt-2 mt-2">
                  <CostBreakdownRow label="Costo total" value={formatMoney(totalCost)} strong />
                  <CostBreakdownRow label="Utilidad" value={formatMoney(profit)} strong />
                  <CostBreakdownRow label="Margen" value={`${margin.toFixed(1)}%`} strong />
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="p-5 rounded-2xl border border-[#F3CBDD] bg-[#FFF5F9] shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[11px] font-extrabold tracking-[0.06em] text-[#D45387] flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                PRECIO PREMIUM RECOMENDADO
              </p>
              <Select value={String(targetMargin)} onValueChange={(value) => setTargetMargin(Number(value))}>
                <SelectTrigger className="w-[88px] h-8 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30%</SelectItem>
                  <SelectItem value="40">40%</SelectItem>
                  <SelectItem value="50">50%</SelectItem>
                  <SelectItem value="60">60%</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-[34px] leading-none font-extrabold tracking-tight text-foreground">
              {isAuditStarted ? formatMoney(recommendedPrice) : 'Pendiente'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              {isAuditStarted
                ? `Precio recomendado para lograr ${targetMargin}% de margen después de costos reales.`
                : 'Completa precio y costos para calcular una recomendación útil.'}
            </p>
          </Card>

          <Card className={`p-5 rounded-2xl border shadow-[0_1px_3px_rgba(16,24,40,0.06)] ${
            verdict.tone === 'neutral'
              ? 'bg-white border-[#E7E1D9]'
              : verdict.tone === 'danger'
              ? 'bg-red-50 border-red-200'
              : verdict.tone === 'warning'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200'
          }`}>
            <div className="flex gap-2.5">
              {verdict.tone === 'neutral' ? (
                <Sparkles className="h-4 w-4 mt-0.5 text-[#D45387]" />
              ) : (
                <AlertTriangle className={`h-4 w-4 mt-0.5 ${
                  verdict.tone === 'danger' ? 'text-red-500' : verdict.tone === 'warning' ? 'text-amber-500' : 'text-emerald-500'
                }`} />
              )}
              <div>
                <p className={`text-sm font-bold ${
                  verdict.tone === 'neutral'
                    ? 'text-foreground'
                    : verdict.tone === 'danger' ? 'text-red-700' : verdict.tone === 'warning' ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {verdict.title}
                </p>
                <p className={`text-sm leading-tight font-semibold ${
                  verdict.tone === 'neutral'
                    ? 'text-muted-foreground'
                    : verdict.tone === 'danger' ? 'text-red-600' : verdict.tone === 'warning' ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {verdict.text}
                </p>
                {verdict.helper ? (
                  <p className="text-sm leading-tight text-muted-foreground mt-1">
                    {verdict.helper}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-2xl leading-none font-extrabold tracking-tight text-foreground">PRODUCTOS EN ANÁLISIS</h2>
          <span className="text-[11px] text-muted-foreground">— Solo simulación, no afectan el inventario</span>
        </div>

        {analysisRows.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            No hay productos en análisis todavía.
          </Card>
        ) : (
          analysisRows.map((item) => (
            <Card key={item.id} className="p-4 rounded-xl border border-[#E7E1D9] shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-lg font-bold text-foreground">{item.name}</p>
                  {item.status === 'approved' ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
                      Aprobado
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-100">
                      En análisis
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Precio: <strong>{formatMoney(item.sale_price)}</strong>
                  {'  '}Costo: <strong>{formatMoney(item.cost)}</strong>
                  {'  '}Margen: <strong className={item.margin_pct < 20 ? 'text-red-600' : 'text-emerald-600'}>{item.margin_pct.toFixed(1)}%</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {analysisSource === ANALYSIS_TABLE && item.status === 'analysis' && (
                  <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => approveItem(item.id)}>
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Aprobar
                  </Button>
                )}

                {(analysisSource === 'products' || item.status === 'approved') && (
                  <Button size="sm" variant="outline" className="border-pink-200 text-[#D45387] hover:bg-pink-50" onClick={() => syncItem(item)}>
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                    Sincronizar
                  </Button>
                )}

                <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => deleteItem(item.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <CostLibrarySelectorDialog
        open={selector.open}
        section={selector.section}
        search={selector.search}
        items={libraryItems}
        isLoading={isLibraryLoading}
        error={libraryError}
        selectedIds={selectedLibraryIds}
        formatMoney={formatMoney}
        onSearchChange={(value) => setSelector((prev) => ({ ...prev, search: value }))}
        onClose={closeCostSelector}
        onAdd={addLibraryLine}
      />

      <AlertDialog open={Boolean(deleteLineTarget)} onOpenChange={(open) => !open && setDeleteLineTarget(null)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar línea de costo</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción solo elimina la línea de este análisis. El costo original de la biblioteca no cambia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => removeLibraryLine(deleteLineTarget.section, deleteLineTarget.lineId)}
            >
              Eliminar línea
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NumericField({ label, hint, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-foreground">{label}</label>
      {hint ? <p className="text-[11px] text-muted-foreground -mt-1">{hint}</p> : null}
      <Input
        type="number"
        step="0.01"
        className="h-11 rounded-xl"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function MiniMetric({ label, helper, value, valueClass = 'text-foreground' }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4 border border-[#E9E2DA] min-h-[148px]">
      <p className="text-[10px] font-extrabold tracking-[0.08em] text-muted-foreground">{label}</p>
      {helper ? <p className="text-[11px] text-muted-foreground mt-0.5">{helper}</p> : null}
      <p className={`text-[24px] tracking-tight leading-none font-extrabold mt-3 ${valueClass}`}>{value}</p>
    </div>
  );
}

function CostBreakdownRow({ label, value, strong = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className={strong ? 'font-bold text-foreground' : 'text-muted-foreground'}>{label}</span>
      <span className={`text-right break-words ${strong ? 'font-extrabold text-foreground' : 'font-semibold text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

function ModeSwitch({ section, mode, onModeChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <Button
        type="button"
        variant={mode === MANUAL_MODE ? 'default' : 'outline'}
        className={`min-h-11 rounded-xl ${mode === MANUAL_MODE ? 'bg-[#D45387] hover:bg-[#C24578] text-white' : ''}`}
        onClick={() => onModeChange(section, MANUAL_MODE)}
      >
        Ingresar total manual
      </Button>
      <Button
        type="button"
        variant={mode === LIBRARY_MODE ? 'default' : 'outline'}
        className={`min-h-11 rounded-xl ${mode === LIBRARY_MODE ? 'bg-[#D45387] hover:bg-[#C24578] text-white' : ''}`}
        onClick={() => onModeChange(section, LIBRARY_MODE)}
      >
        Seleccionar de mi biblioteca
      </Button>
      <Button
        type="button"
        variant={mode === MIXED_MODE ? 'default' : 'outline'}
        className={`min-h-11 rounded-xl ${mode === MIXED_MODE ? 'bg-[#D45387] hover:bg-[#C24578] text-white' : ''}`}
        onClick={() => onModeChange(section, MIXED_MODE)}
      >
        Manual + biblioteca
      </Button>
    </div>
  );
}

function PhysicalCostSection({
  section,
  title,
  hint,
  mode,
  onModeChange,
  manualField,
  extraManualField = null,
  lines,
  summary,
  manualAmount = 0,
  formatMoney,
  onOpenSelector,
  onUpdateLine,
  onRequestRemove,
}) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const hasLines = lines.length > 0;

  return (
    <div className="rounded-2xl border border-[#E7E1D9] bg-white p-4 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <ModeSwitch section={section} mode={mode} onModeChange={onModeChange} />

      {mode === MANUAL_MODE ? (
        <div className="space-y-3">
          {manualField}
          {hasLines ? (
            <div className="rounded-xl border border-[#E7E1D9] bg-muted/40 p-3 text-xs text-muted-foreground">
              {lines.length} {lines.length === 1 ? 'línea de biblioteca conservada' : 'líneas de biblioteca conservadas'}.
              No suman mientras esta sección esté en modo manual.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {mode === MIXED_MODE ? manualField : extraManualField}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full rounded-xl border-pink-200 text-[#D45387] hover:bg-pink-50"
            onClick={() => onOpenSelector(section)}
          >
            <Plus className="mr-2 h-4 w-4" />
            {PHYSICAL_LIBRARY_SECTIONS[section].addLabel}
          </Button>

          {hasLines ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[#E7E1D9] bg-[#FFFCFA] p-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">Desglose seleccionado</p>
                <p className="text-xs text-muted-foreground">
                  {lines.length} {lines.length === 1 ? 'línea' : 'líneas'} · subtotal {formatMoney(summary.computedAmount)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-xl"
                onClick={() => setDetailsOpen((current) => !current)}
                aria-expanded={detailsOpen}
              >
                {detailsOpen ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                {detailsOpen ? 'Minimizar desglose' : 'Ver desglose'}
              </Button>
            </div>
          ) : null}

          {!hasLines ? (
            <div className="rounded-xl border border-dashed border-[#E7E1D9] p-4 text-sm text-muted-foreground">
              {PHYSICAL_LIBRARY_SECTIONS[section].emptyText}
            </div>
          ) : detailsOpen ? (
            <div className="space-y-3">
              {lines.map((line) => (
                <CostLineCard
                  key={line.lineId}
                  line={line}
                  section={section}
                  formatMoney={formatMoney}
                  onUpdateLine={onUpdateLine}
                  onRequestRemove={onRequestRemove}
                />
              ))}
            </div>
          ) : null}

          <div className="rounded-xl bg-muted/40 p-3 space-y-1 text-sm">
            {section === 'materials' ? (
              <>
                <CostBreakdownRow label="Subtotal sin merma" value={formatMoney(summary.baseAmount)} />
                <CostBreakdownRow label="Merma" value={formatMoney(summary.wasteAmount)} />
              </>
            ) : null}
            {mode === MIXED_MODE ? (
              <>
                <CostBreakdownRow label="Subtotal manual" value={formatMoney(manualAmount)} />
                <CostBreakdownRow label="Subtotal biblioteca" value={formatMoney(summary.computedAmount)} />
                <CostBreakdownRow label="Total combinado" value={formatMoney(manualAmount + summary.computedAmount)} strong />
              </>
            ) : (
              <CostBreakdownRow label={`Subtotal ${title.toLowerCase()}`} value={formatMoney(summary.computedAmount)} strong />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CostLineCard({ line, section, formatMoney, onUpdateLine, onRequestRemove }) {
  const result = calculateCostLine(line);
  const item = normalizeCostLibraryItem(line.item);
  const isLabor = section === 'labor';
  const appliedWastePercentage = getLineWastePercentage(line);

  return (
    <div className="rounded-xl border border-[#E7E1D9] bg-[#FFFCFA] p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground break-words">{item.name}</p>
          <p className="text-xs text-muted-foreground break-words">
            {getReferenceCost(item, formatMoney)}
            {item.usageUnit ? ` · ${item.usageUnit}` : ''}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 text-red-500 hover:text-red-600"
          aria-label={`Eliminar ${item.name}`}
          onClick={() => onRequestRemove({ section, lineId: line.lineId })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isLabor ? (
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${line.lineId}-minutes`} className="text-xs">Minutos</Label>
            <Input
              id={`${line.lineId}-minutes`}
              type="number"
              min="0"
              step="1"
              className="h-11 rounded-xl"
              value={line.minutes}
              onChange={(event) => onUpdateLine(section, line.lineId, { minutes: event.target.value })}
            />
          </div>
          <div className="rounded-xl bg-white p-3 text-sm">
            <p className="text-xs text-muted-foreground">Valor hora</p>
            <p className="font-bold">{formatMoney(item.hourlyRate)}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${line.lineId}-quantity`} className="text-xs">Cantidad utilizada</Label>
            <Input
              id={`${line.lineId}-quantity`}
              type="number"
              min="0"
              step="0.01"
              className="h-11 rounded-xl"
              value={line.quantity}
              onChange={(event) => onUpdateLine(section, line.lineId, { quantity: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${line.lineId}-waste`} className="text-xs">Merma override (%)</Label>
            <Input
              id={`${line.lineId}-waste`}
              type="number"
              min="0"
              step="0.01"
              className="h-11 rounded-xl"
              placeholder={`${item.wastePercentage || 0}%`}
              value={line.wastePercentageOverride}
              onChange={(event) => onUpdateLine(section, line.lineId, { wastePercentageOverride: event.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              Merma aplicada: {appliedWastePercentage}%
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-white p-2">
          <p className="text-muted-foreground">Base</p>
          <p className="font-bold">{formatMoney(result.baseAmount)}</p>
        </div>
        <div className="rounded-lg bg-white p-2">
          <p className="text-muted-foreground">Merma</p>
          <p className="font-bold">{formatMoney(result.wasteAmount)}</p>
        </div>
        <div className="rounded-lg bg-white p-2">
          <p className="text-muted-foreground">Total</p>
          <p className="font-bold">{formatMoney(result.computedAmount)}</p>
        </div>
      </div>
    </div>
  );
}

function CostLibrarySelectorDialog({
  open,
  section,
  search,
  items,
  isLoading,
  error,
  selectedIds,
  formatMoney,
  onSearchChange,
  onClose,
  onAdd,
}) {
  const sectionConfig = PHYSICAL_LIBRARY_SECTIONS[section] || PHYSICAL_LIBRARY_SECTIONS.materials;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="bottom-0 left-0 top-4 flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full max-w-none translate-x-0 translate-y-0 grid-rows-none flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle>Seleccionar de mi biblioteca</DialogTitle>
          <DialogDescription>
            {sectionConfig.title} activos para producto físico.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b p-4 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 rounded-xl pl-9"
              placeholder="Buscar por nombre o proveedor"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:px-6">
          {isLoading ? (
            <div className="flex min-h-[160px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : null}

          {!isLoading && error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 break-words">
              {error}
            </div>
          ) : null}

          {!isLoading && !error && items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E7E1D9] p-5 text-sm text-muted-foreground">
              No hay costos activos para esta sección.
            </div>
          ) : null}

          {!isLoading && !error ? items.map((item) => {
            const selected = selectedIds.has(item.id);
            return (
              <div key={item.id} className="rounded-xl border border-[#E7E1D9] bg-white p-4">
                <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground break-words">{item.name}</p>
                    {item.provider ? (
                      <p className="text-xs text-muted-foreground break-words">{item.provider}</p>
                    ) : null}
                    <p className="text-sm font-semibold text-[#D45387] mt-1">
                      {getReferenceCost(item, formatMoney)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="min-h-11 shrink-0 rounded-xl bg-[#D45387] hover:bg-[#C24578] text-white"
                    disabled={selected}
                    onClick={() => onAdd(item)}
                  >
                    {selected ? 'Agregado' : 'Agregar'}
                  </Button>
                </div>
              </div>
            );
          }) : null}
        </div>

        <div className="shrink-0 border-t bg-white p-4 sm:px-6">
          <Button type="button" variant="outline" className="min-h-11 w-full rounded-xl" onClick={onClose}>
            <X className="mr-2 h-4 w-4" />
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
