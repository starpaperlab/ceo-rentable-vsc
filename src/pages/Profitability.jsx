import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  FlaskConical,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  extractMissingColumnFromError,
  fetchOwnedRows,
  hasOwnerConstraintIssue,
  isMissingColumnError,
} from '@/lib/supabaseOwnership';

const ANALYSIS_TABLE = 'product_analysis';
const PRODUCT_TYPES = [
  { value: 'fisico', label: '📦 Físico' },
  { value: 'digital', label: '💻 Digital' },
  { value: 'servicio', label: '🛠 Servicio' },
];

function toNumber(value) {
  return Number(value || 0);
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

export default function Profitability() {
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

  const price = toNumber(form.price);
  const materials = toNumber(form.materials);
  const hiddenCosts = toNumber(form.hidden);
  const hours = toNumber(form.time);
  const hourlyRate = toNumber(form.hourly);
  const commissionPct = toNumber(form.commission);
  const ads = toNumber(form.ads);

  const operationalCost = materials + hiddenCosts + ads + (hours * hourlyRate);
  const commissionCost = price * (commissionPct / 100);
  const totalCost = operationalCost + commissionCost;
  const profit = price - totalCost;
  const margin = price > 0 ? ((profit / price) * 100) : 0;
  const breakEvenUnits = profit > 0 ? Math.ceil(totalCost / profit) : 0;
  const recommendedPrice = targetMargin >= 100
    ? 0
    : (totalCost <= 0 ? 0 : totalCost / (1 - (targetMargin / 100)));

  const verdict = useMemo(() => {
    if (margin < 20) {
      return {
        tone: 'danger',
        title: 'VEREDICTO FINANCIERO',
        text: 'Atención: este producto deja poco dinero. Ajusta el precio o reduce costos.',
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
      text: 'Excelente margen. Este producto es sólido para escalar.',
    };
  }, [margin]);

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
      const { error } = await supabase
        .from(table)
        .update({ status: nextStatus })
        .eq('id', id);
      if (error) throw error;
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
        await supabase
          .from(ANALYSIS_TABLE)
          .update({ status: 'synced' })
          .eq('id', item.id);
      } else {
        const { error } = await supabase
          .from('products')
          .update({ status: 'active' })
          .eq('id', item.id);
        if (error) throw error;
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
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
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
            <label className="text-xs font-semibold text-foreground">Nombre del Producto</label>
            <Input
              className="h-12 rounded-xl"
              placeholder="Ej: Curso de Marketing Digital"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumericField
              label={`Precio de Venta (${moneyUnit})`}
              hint="Lo que cobras por este producto"
              value={form.price}
              onChange={(value) => setForm((prev) => ({ ...prev, price: value }))}
            />
            <NumericField
              label={`Materiales (${moneyUnit})`}
              hint="Incluye todos los gastos necesarios"
              value={form.materials}
              onChange={(value) => setForm((prev) => ({ ...prev, materials: value }))}
            />
            <NumericField
              label={`Costos Ocultos (${moneyUnit})`}
              value={form.hidden}
              onChange={(value) => setForm((prev) => ({ ...prev, hidden: value }))}
            />
            <NumericField
              label="Tiempo (Horas)"
              value={form.time}
              onChange={(value) => setForm((prev) => ({ ...prev, time: value }))}
            />
            <NumericField
              label={`Valor Hora (${moneyUnit})`}
              value={form.hourly}
              onChange={(value) => setForm((prev) => ({ ...prev, hourly: value }))}
            />
            <NumericField
              label="Comis./Impuestos (%)"
              hint="% que se queda la plataforma"
              value={form.commission}
              onChange={(value) => setForm((prev) => ({ ...prev, commission: value }))}
            />
          </div>

          <div className="mt-3">
            <NumericField
              label={`Inversión en Ads por venta (${moneyUnit})`}
              value={form.ads}
              onChange={(value) => setForm((prev) => ({ ...prev, ads: value }))}
            />
          </div>

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
                value={`${breakEvenUnits} und.`}
              />
            </div>
          </Card>

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

            <p className="text-[34px] leading-none font-extrabold tracking-tight text-foreground">{formatMoney(recommendedPrice)}</p>
            <p className="text-[11px] text-muted-foreground mt-2">
              Precio recomendado para lograr {targetMargin}% de margen después de costos reales.
            </p>
          </Card>

          <Card className={`p-5 rounded-2xl border shadow-[0_1px_3px_rgba(16,24,40,0.06)] ${
            verdict.tone === 'danger'
              ? 'bg-red-50 border-red-200'
              : verdict.tone === 'warning'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200'
          }`}>
            <div className="flex gap-2.5">
              <AlertTriangle className={`h-4 w-4 mt-0.5 ${
                verdict.tone === 'danger' ? 'text-red-500' : verdict.tone === 'warning' ? 'text-amber-500' : 'text-emerald-500'
              }`} />
              <div>
                <p className={`text-sm font-bold ${
                  verdict.tone === 'danger' ? 'text-red-700' : verdict.tone === 'warning' ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {verdict.title}
                </p>
                <p className={`text-sm leading-tight font-semibold ${
                  verdict.tone === 'danger' ? 'text-red-600' : verdict.tone === 'warning' ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {verdict.text}
                </p>
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
