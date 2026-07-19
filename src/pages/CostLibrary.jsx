import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Copy,
  Filter,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCurrency } from '@/components/shared/CurrencyContext';
import {
  createCostLibraryItem,
  deleteCostLibraryItem,
  duplicateCostLibraryItem,
  listCostLibraryItems,
  setCostLibraryItemActive,
  updateCostLibraryItem,
} from '@/lib/costLibrary';
import {
  calculateLibraryItemUnitCost,
  COST_LIBRARY_BILLING_PERIODS,
  COST_LIBRARY_CALCULATION_TYPES,
  COST_LIBRARY_CATEGORIES,
  COST_LIBRARY_PRODUCT_TYPES,
  COST_LIBRARY_USAGE_UNITS,
  DEFAULT_COST_LIBRARY_ITEM,
  normalizeCostLibraryItem,
  validateCostLibraryItem,
} from '@/lib/costLibraryTypes';

const CATEGORY_LABELS = {
  material: 'Material',
  empaque: 'Empaque',
  herramienta_plataforma: 'Herramienta o plataforma',
  proceso_mano_obra: 'Proceso o mano de obra',
  soporte: 'Soporte',
  onboarding_entrega: 'Onboarding o entrega',
  subcontrato: 'Subcontrato',
  traslado: 'Traslado',
  gasto_operativo: 'Gasto operativo',
  comision_impuesto: 'Comision o impuesto',
  publicidad_captacion: 'Publicidad o captacion',
  otro: 'Otro',
};

const CALCULATION_TYPE_LABELS = {
  fixed: 'Importe fijo',
  per_unit: 'Por unidad',
  hourly: 'Por hora',
  percentage: 'Porcentaje sobre venta',
  monthly_prorated: 'Mensual prorrateado',
  annual_prorated: 'Anual prorrateado',
};

const PRODUCT_TYPE_LABELS = {
  fisico: 'Producto fisico',
  digital: 'Producto digital',
  servicio: 'Servicio',
};

const BILLING_PERIOD_LABELS = {
  one_time: 'Una vez',
  per_sale: 'Por venta',
  monthly: 'Mensual',
  annual: 'Anual',
};

const EMPTY_FORM = {
  ...DEFAULT_COST_LIBRARY_ITEM,
  name: '',
  description: '',
  category: 'material',
  calculationType: 'fixed',
  appliesToProductTypes: ['fisico'],
  isActive: true,
  fixedAmount: '',
  purchaseCost: '',
  purchaseQuantity: '',
  usageUnit: 'unidad',
  wastePercentage: '',
  hourlyRate: '',
  percentageRate: '',
  fixedFee: '',
  monthlyCost: '',
  annualCost: '',
  estimatedMonthlyAllocations: '',
  estimatedAnnualAllocations: '',
  billingPeriod: 'per_sale',
  provider: '',
  notes: '',
  lastCostUpdate: '',
};

function createFormState(item = null) {
  if (!item) return { ...EMPTY_FORM };
  return {
    ...EMPTY_FORM,
    ...item,
    fixedAmount: `${item.fixedAmount ?? ''}`,
    purchaseCost: `${item.purchaseCost ?? ''}`,
    purchaseQuantity: `${item.purchaseQuantity ?? ''}`,
    wastePercentage: `${item.wastePercentage ?? ''}`,
    hourlyRate: `${item.hourlyRate ?? ''}`,
    percentageRate: `${item.percentageRate ?? ''}`,
    fixedFee: `${item.fixedFee ?? ''}`,
    monthlyCost: `${item.monthlyCost ?? ''}`,
    annualCost: `${item.annualCost ?? ''}`,
    estimatedMonthlyAllocations: `${item.estimatedMonthlyAllocations ?? ''}`,
    estimatedAnnualAllocations: `${item.estimatedAnnualAllocations ?? ''}`,
    lastCostUpdate: item.lastCostUpdate || '',
  };
}

function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

function FormField({ id, label, error, children }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function getReferenceText(item, formatMoney) {
  const normalized = normalizeCostLibraryItem(item);
  const result = calculateLibraryItemUnitCost(normalized, {
    quantity: 1,
    hours: 1,
    salePrice: 100,
  });
  const computedAmount = result.computedAmount || 0;
  const amount = formatMoney(computedAmount);
  const preciseAmount = Number.isInteger(computedAmount)
    ? amount
    : amount.replace(/\d+(?:[.,]\d+)?/, computedAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }));

  if (normalized.calculationType === 'per_unit') return `${preciseAmount} por unidad`;
  if (normalized.calculationType === 'hourly') return `${amount} por hora`;
  if (normalized.calculationType === 'percentage') {
    const fee = normalized.fixedFee > 0 ? ` + ${formatMoney(normalized.fixedFee)} fijo` : '';
    return `${normalized.percentageRate}%${fee}`;
  }
  if (normalized.calculationType === 'monthly_prorated') return `${amount} por venta estimada`;
  if (normalized.calculationType === 'annual_prorated') return `${amount} por venta estimada`;
  return amount;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mapStatusFilter(value) {
  if (value === 'active') return true;
  if (value === 'inactive') return false;
  return undefined;
}

function FiltersPanel({ filters, onChange, compact = false }) {
  const selectClass = 'min-h-11';

  return (
    <div className={compact ? 'space-y-4' : 'grid gap-3 md:grid-cols-4'}>
      <div className="space-y-2">
        <Label>Categoría</Label>
        <Select value={filters.category} onValueChange={(value) => onChange({ category: value })}>
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {COST_LIBRARY_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>{CATEGORY_LABELS[category]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tipo de negocio</Label>
        <Select value={filters.productType} onValueChange={(value) => onChange({ productType: value })}>
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {COST_LIBRARY_PRODUCT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{PRODUCT_TYPE_LABELS[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tipo de cálculo</Label>
        <Select value={filters.calculationType} onValueChange={(value) => onChange({ calculationType: value })}>
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {COST_LIBRARY_CALCULATION_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{CALCULATION_TYPE_LABELS[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Estado</Label>
        <Select value={filters.status} onValueChange={(value) => onChange({ status: value })}>
          <SelectTrigger className={selectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CostCard({
  item,
  formatMoney,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
  busy,
}) {
  return (
    <Card className="rounded-lg border p-4 shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-base font-semibold text-foreground">{item.name}</h3>
              <Badge
                variant="outline"
                className={item.isActive ? 'border-emerald-200 text-emerald-700' : 'border-muted text-muted-foreground'}
              >
                {item.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
            {item.provider && (
              <p className="break-words text-sm text-muted-foreground">Proveedor: {item.provider}</p>
            )}
          </div>

          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <p className="break-words">
              <span className="font-medium text-foreground">Categoría:</span> {CATEGORY_LABELS[item.category]}
            </p>
            <p className="break-words">
              <span className="font-medium text-foreground">Cálculo:</span> {CALCULATION_TYPE_LABELS[item.calculationType]}
            </p>
            <p className="break-words">
              <span className="font-medium text-foreground">Referencia:</span> {getReferenceText(item, formatMoney)}
            </p>
            {item.lastCostUpdate && (
              <p className="break-words">
                <span className="font-medium text-foreground">Actualizado:</span> {formatDate(item.lastCostUpdate)}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {item.appliesToProductTypes.map((type) => (
              <Badge key={type} variant="secondary" className="break-words">
                {PRODUCT_TYPE_LABELS[type]}
              </Badge>
            ))}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" aria-label={`Acciones de ${item.name}`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onEdit(item)}>
              <Pencil className="h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(item)}>
              <Copy className="h-4 w-4" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(item)}>
              <Power className="h-4 w-4" />
              {item.isActive ? 'Desactivar' : 'Activar'}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(item)}>
              <Trash2 className="h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

function CostFormModal({ open, item, onOpenChange, onSubmit, isSaving, formatMoney }) {
  const [form, setForm] = useState(() => createFormState(item));
  const [errors, setErrors] = useState({});
  const isEditing = Boolean(item?.id);
  const normalizedPreview = useMemo(() => normalizeCostLibraryItem(form), [form]);

  useEffect(() => {
    if (open) {
      setForm(createFormState(item));
      setErrors({});
    }
  }, [item, open]);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const toggleProductType = (type, checked) => {
    setForm((current) => {
      const currentTypes = Array.isArray(current.appliesToProductTypes) ? current.appliesToProductTypes : [];
      const nextTypes = checked
        ? Array.from(new Set([...currentTypes, type]))
        : currentTypes.filter((itemType) => itemType !== type);
      return { ...current, appliesToProductTypes: nextTypes };
    });
    setErrors((current) => {
      if (!current.appliesToProductTypes) return current;
      const next = { ...current };
      delete next.appliesToProductTypes;
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = validateCostLibraryItem(form);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    await onSubmit(normalizeCostLibraryItem(form));
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <DialogContent className="bottom-0 left-0 top-4 flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full max-w-none translate-x-0 translate-y-0 grid-rows-none flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle>{isEditing ? 'Editar costo' : 'Nuevo costo'}</DialogTitle>
          <DialogDescription>
            Define un costo reutilizable para productos físicos, digitales o servicios.
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Información básica</h3>
              <FormField id="cost-name" label="Nombre" error={errors.name}>
                <Input
                  id="cost-name"
                  className="min-h-11"
                  value={form.name}
                  onChange={(event) => setField('name', event.target.value)}
                  placeholder="Ej: Papel fotografico"
                  disabled={isSaving}
                />
              </FormField>

              <FormField id="cost-description" label="Descripción opcional" error={errors.description}>
                <Textarea
                  id="cost-description"
                  value={form.description}
                  onChange={(event) => setField('description', event.target.value)}
                  disabled={isSaving}
                />
              </FormField>

              <FormField id="cost-category" label="Categoría" error={errors.category}>
                <Select value={form.category} onValueChange={(value) => setField('category', value)} disabled={isSaving}>
                  <SelectTrigger id="cost-category" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_LIBRARY_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{CATEGORY_LABELS[category]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <div className="space-y-2">
                <Label>Aplica a</Label>
                <div className="grid gap-2">
                  {COST_LIBRARY_PRODUCT_TYPES.map((type) => (
                    <label
                      key={type}
                      className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={form.appliesToProductTypes.includes(type)}
                        onCheckedChange={(checked) => toggleProductType(type, checked === true)}
                        disabled={isSaving}
                      />
                      {PRODUCT_TYPE_LABELS[type]}
                    </label>
                  ))}
                </div>
                <FieldError message={errors.appliesToProductTypes} />
              </div>

              <div className="flex min-h-11 items-center justify-between gap-4 rounded-lg border px-3 py-2">
                <Label htmlFor="cost-active">Activo</Label>
                <Switch
                  id="cost-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setField('isActive', checked)}
                  disabled={isSaving}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Forma de cálculo</h3>
              <FormField id="cost-calculation" label="Tipo de cálculo" error={errors.calculationType}>
                <Select value={form.calculationType} onValueChange={(value) => setField('calculationType', value)} disabled={isSaving}>
                  <SelectTrigger id="cost-calculation" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_LIBRARY_CALCULATION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{CALCULATION_TYPE_LABELS[type]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {form.calculationType === 'fixed' && (
                <FormField id="fixed-amount" label="Importe fijo" error={errors.fixedAmount}>
                  <Input id="fixed-amount" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.fixedAmount} onChange={(event) => setField('fixedAmount', event.target.value)} disabled={isSaving} />
                </FormField>
              )}

              {form.calculationType === 'per_unit' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="purchase-cost" label="Costo de compra" error={errors.purchaseCost}>
                    <Input id="purchase-cost" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.purchaseCost} onChange={(event) => setField('purchaseCost', event.target.value)} disabled={isSaving} />
                  </FormField>
                  <FormField id="purchase-quantity" label="Cantidad comprada" error={errors.purchaseQuantity}>
                    <Input id="purchase-quantity" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.purchaseQuantity} onChange={(event) => setField('purchaseQuantity', event.target.value)} disabled={isSaving} />
                  </FormField>
                  <FormField id="usage-unit" label="Unidad de consumo" error={errors.usageUnit}>
                    <Select value={form.usageUnit} onValueChange={(value) => setField('usageUnit', value)} disabled={isSaving}>
                      <SelectTrigger id="usage-unit" className="min-h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COST_LIBRARY_USAGE_UNITS.map((unit) => (
                          <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField id="waste-percentage" label="Merma %" error={errors.wastePercentage}>
                    <Input id="waste-percentage" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.wastePercentage} onChange={(event) => setField('wastePercentage', event.target.value)} disabled={isSaving} />
                  </FormField>
                </div>
              )}

              {form.calculationType === 'hourly' && (
                <FormField id="hourly-rate" label="Valor por hora" error={errors.hourlyRate}>
                  <Input id="hourly-rate" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.hourlyRate} onChange={(event) => setField('hourlyRate', event.target.value)} disabled={isSaving} />
                </FormField>
              )}

              {form.calculationType === 'percentage' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="percentage-rate" label="Porcentaje" error={errors.percentageRate}>
                    <Input id="percentage-rate" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.percentageRate} onChange={(event) => setField('percentageRate', event.target.value)} disabled={isSaving} />
                  </FormField>
                  <FormField id="fixed-fee" label="Cargo fijo opcional" error={errors.fixedFee}>
                    <Input id="fixed-fee" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.fixedFee} onChange={(event) => setField('fixedFee', event.target.value)} disabled={isSaving} />
                  </FormField>
                </div>
              )}

              {form.calculationType === 'monthly_prorated' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="monthly-cost" label="Costo mensual" error={errors.monthlyCost}>
                    <Input id="monthly-cost" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.monthlyCost} onChange={(event) => setField('monthlyCost', event.target.value)} disabled={isSaving} />
                  </FormField>
                  <FormField id="monthly-allocations" label="Cantidad estimada mensual" error={errors.estimatedMonthlyAllocations}>
                    <Input id="monthly-allocations" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.estimatedMonthlyAllocations} onChange={(event) => setField('estimatedMonthlyAllocations', event.target.value)} disabled={isSaving} />
                  </FormField>
                </div>
              )}

              {form.calculationType === 'annual_prorated' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="annual-cost" label="Costo anual" error={errors.annualCost}>
                    <Input id="annual-cost" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.annualCost} onChange={(event) => setField('annualCost', event.target.value)} disabled={isSaving} />
                  </FormField>
                  <FormField id="annual-allocations" label="Cantidad estimada anual" error={errors.estimatedAnnualAllocations}>
                    <Input id="annual-allocations" type="number" inputMode="decimal" min="0" className="min-h-11" value={form.estimatedAnnualAllocations} onChange={(event) => setField('estimatedAnnualAllocations', event.target.value)} disabled={isSaving} />
                  </FormField>
                </div>
              )}

              <Card className="rounded-lg border-primary/20 bg-primary/5 p-4 shadow-none">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">Costo de referencia</p>
                <p className="mt-2 break-words text-xl font-bold text-foreground">
                  {getReferenceText(normalizedPreview, formatMoney)}
                </p>
              </Card>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Información adicional</h3>
              <FormField id="provider" label="Proveedor" error={errors.provider}>
                <Input id="provider" className="min-h-11" value={form.provider} onChange={(event) => setField('provider', event.target.value)} disabled={isSaving} />
              </FormField>
              <FormField id="notes" label="Notas" error={errors.notes}>
                <Textarea id="notes" value={form.notes} onChange={(event) => setField('notes', event.target.value)} disabled={isSaving} />
              </FormField>
              <FormField id="last-cost-update" label="Fecha de última actualización del costo" error={errors.lastCostUpdate}>
                <Input id="last-cost-update" type="date" className="min-h-11" value={form.lastCostUpdate || ''} onChange={(event) => setField('lastCostUpdate', event.target.value)} disabled={isSaving} />
              </FormField>
              {['fixed', 'percentage', 'monthly_prorated', 'annual_prorated'].includes(form.calculationType) && (
                <FormField id="billing-period" label="Periodicidad" error={errors.billingPeriod}>
                  <Select value={form.billingPeriod} onValueChange={(value) => setField('billingPeriod', value)} disabled={isSaving}>
                    <SelectTrigger id="billing-period" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_LIBRARY_BILLING_PERIODS.map((period) => (
                        <SelectItem key={period} value={period}>{BILLING_PERIOD_LABELS[period]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </section>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-background p-4 shadow-[0_-8px_20px_rgba(15,23,42,0.06)] sm:flex-row sm:justify-end sm:px-6">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? 'Guardando...' : 'Guardar costo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CostLibrary() {
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [filters, setFilters] = useState({
    category: 'all',
    productType: 'all',
    calculationType: 'all',
    status: 'all',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const showNotice = (title, description = '', variant = 'success') => {
    setNotice({
      id: Date.now(),
      title,
      description,
      variant,
    });
  };

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const queryFilters = useMemo(() => ({
    search: debouncedSearch,
    category: filters.category === 'all' ? undefined : filters.category,
    productType: filters.productType === 'all' ? undefined : filters.productType,
    calculationType: filters.calculationType === 'all' ? undefined : filters.calculationType,
    isActive: mapStatusFilter(filters.status),
    orderBy: 'name',
    ascending: true,
  }), [debouncedSearch, filters]);

  const {
    data: allItems = [],
    isLoading: loadingSummary,
  } = useQuery({
    queryKey: ['cost-library-summary'],
    queryFn: () => listCostLibraryItems({ orderBy: 'name', ascending: true }),
  });

  const {
    data: items = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cost-library-items', queryFilters],
    queryFn: () => listCostLibraryItems(queryFilters),
  });

  const invalidateLibrary = () => {
    queryClient.invalidateQueries({ queryKey: ['cost-library-items'] });
    queryClient.invalidateQueries({ queryKey: ['cost-library-summary'] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => editingItem?.id
      ? updateCostLibraryItem(editingItem.id, payload)
      : createCostLibraryItem(payload),
    onSuccess: () => {
      showNotice(editingItem?.id ? 'Costo actualizado' : 'Costo creado');
      invalidateLibrary();
      setFormOpen(false);
      setEditingItem(null);
    },
    onError: (mutationError) => {
      showNotice('No se pudo guardar', mutationError.message, 'error');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (item) => duplicateCostLibraryItem(item.id, { name: `${item.name} - Copia` }),
    onMutate: (item) => setBusyId(item.id),
    onSuccess: () => {
      showNotice('Costo duplicado');
      invalidateLibrary();
    },
    onError: (mutationError) => {
      showNotice('No se pudo duplicar', mutationError.message, 'error');
    },
    onSettled: () => setBusyId(null),
  });

  const toggleMutation = useMutation({
    mutationFn: (item) => setCostLibraryItemActive(item.id, !item.isActive),
    onMutate: async (item) => {
      setBusyId(item.id);
      await queryClient.cancelQueries({ queryKey: ['cost-library-items'] });
      const previousItems = queryClient.getQueryData(['cost-library-items', queryFilters]);
      queryClient.setQueryData(['cost-library-items', queryFilters], (current = []) => (
        current.map((row) => row.id === item.id ? { ...row, isActive: !row.isActive } : row)
      ));
      return { previousItems };
    },
    onSuccess: () => {
      invalidateLibrary();
    },
    onError: (mutationError, _item, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(['cost-library-items', queryFilters], context.previousItems);
      }
      showNotice('No se pudo cambiar el estado', mutationError.message, 'error');
    },
    onSettled: () => setBusyId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (item) => deleteCostLibraryItem(item.id),
    onMutate: (item) => setBusyId(item.id),
    onSuccess: () => {
      showNotice('Costo eliminado');
      invalidateLibrary();
      setDeleteTarget(null);
    },
    onError: (mutationError) => {
      showNotice('No se pudo eliminar', mutationError.message, 'error');
    },
    onSettled: () => setBusyId(null),
  });

  const summary = useMemo(() => {
    const categories = new Set(allItems.map((item) => item.category).filter(Boolean));
    return {
      total: allItems.length,
      active: allItems.filter((item) => item.isActive).length,
      categories: categories.size,
    };
  }, [allItems]);

  const updateFilters = (changes) => {
    setFilters((current) => ({ ...current, ...changes }));
  };

  const openCreateForm = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const openEditForm = (item) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:py-6 lg:px-6">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="break-words text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Biblioteca de Costos
            </h1>
            <p className="max-w-3xl break-words text-sm leading-relaxed text-muted-foreground">
              Registra una vez tus materiales, herramientas, comisiones y otros costos para reutilizarlos en tus cálculos.
            </p>
          </div>
          <Button className="min-h-11 w-full gap-2 sm:w-auto" onClick={openCreateForm}>
            <Plus className="h-4 w-4" />
            Nuevo costo
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            ['Total de costos', summary.total],
            ['Activos', summary.active],
            ['Categorías utilizadas', summary.categories],
          ].map(([label, value]) => (
            <Card key={label} className="rounded-lg p-3 shadow-sm">
              <p className="break-words text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {loadingSummary ? <Skeleton className="h-7 w-12" /> : value}
              </p>
            </Card>
          ))}
        </div>

        <Card className="rounded-lg p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="cost-library-search">Búsqueda</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="cost-library-search"
                  className="min-h-11 pl-9"
                  placeholder="Buscar por nombre o proveedor"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <Button variant="outline" className="min-h-11 gap-2 md:hidden" onClick={() => setFiltersOpen(true)}>
              <Filter className="h-4 w-4" />
              Filtros
            </Button>
          </div>

          <div className="mt-4 hidden md:block">
            <FiltersPanel filters={filters} onChange={updateFilters} />
          </div>
        </Card>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <Card key={item} className="rounded-lg p-4 shadow-sm">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-4/5" />
              </Card>
            ))}
          </div>
        )}

        {isError && (
          <Card className="rounded-lg border-destructive/30 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="font-semibold text-foreground">No se pudo cargar la biblioteca</p>
                  <p className="break-words text-sm text-muted-foreground">{error?.message}</p>
                </div>
                <Button variant="outline" className="min-h-11" onClick={() => refetch()}>
                  Reintentar
                </Button>
              </div>
            </div>
          </Card>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <Card className="rounded-lg p-6 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Aún no tienes costos registrados</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Crea tu primer material, herramienta, comisión o costo operativo para reutilizarlo después.
            </p>
            <Button className="mt-5 min-h-11 gap-2" onClick={openCreateForm}>
              <Plus className="h-4 w-4" />
              Crear primer costo
            </Button>
          </Card>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div className="space-y-3">
            {items.map((item) => (
              <CostCard
                key={item.id}
                item={item}
                formatMoney={formatMoney}
                busy={busyId === item.id}
                onEdit={openEditForm}
                onDuplicate={(target) => duplicateMutation.mutate(target)}
                onToggleActive={(target) => toggleMutation.mutate(target)}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="bottom-0 left-0 top-auto max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl p-0 sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg">
          <DialogHeader className="border-b px-4 py-4 pr-12 text-left">
            <DialogTitle>Filtros</DialogTitle>
            <DialogDescription>Refina la biblioteca sin saturar la vista móvil.</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-4 py-4">
            <FiltersPanel filters={filters} onChange={updateFilters} compact />
          </div>
          <div className="border-t p-4">
            <Button className="min-h-11 w-full" onClick={() => setFiltersOpen(false)}>Aplicar filtros</Button>
          </div>
        </DialogContent>
      </Dialog>

      <CostFormModal
        open={formOpen}
        item={editingItem}
        onOpenChange={(nextOpen) => {
          setFormOpen(nextOpen);
          if (!nextOpen) setEditingItem(null);
        }}
        onSubmit={(payload) => saveMutation.mutateAsync(payload)}
        isSaving={saveMutation.isPending}
        formatMoney={formatMoney}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar costo</AlertDialogTitle>
            <AlertDialogDescription>
              Este costo se eliminará de tu biblioteca. Los análisis históricos que usaron una copia del costo no deberían verse afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget);
              }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {notice && (
        <div
          role="status"
          className={`fixed bottom-4 left-4 right-4 z-[60] rounded-lg border p-3 text-sm shadow-lg sm:left-auto sm:w-80 ${
            notice.variant === 'error'
              ? 'border-destructive/30 bg-destructive text-destructive-foreground'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words font-semibold">{notice.title}</p>
              {notice.description && (
                <p className="mt-1 break-words text-xs opacity-90">{notice.description}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-2 text-current hover:bg-black/5"
              onClick={() => setNotice(null)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
