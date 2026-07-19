export const COST_LIBRARY_CATEGORIES = [
  'material',
  'empaque',
  'herramienta_plataforma',
  'proceso_mano_obra',
  'soporte',
  'onboarding_entrega',
  'subcontrato',
  'traslado',
  'gasto_operativo',
  'comision_impuesto',
  'publicidad_captacion',
  'otro',
];

export const COST_LIBRARY_CALCULATION_TYPES = [
  'fixed',
  'per_unit',
  'hourly',
  'percentage',
  'monthly_prorated',
  'annual_prorated',
];

export const COST_LIBRARY_PRODUCT_TYPES = [
  'fisico',
  'digital',
  'servicio',
];

export const COST_LIBRARY_BILLING_PERIODS = [
  'one_time',
  'per_sale',
  'monthly',
  'annual',
];

export const COST_LIBRARY_USAGE_UNITS = [
  'unidad',
  'hoja',
  'paquete',
  'caja',
  'rollo',
  'metro',
  'centimetro',
  'pie',
  'yarda',
  'gramo',
  'kilogramo',
  'mililitro',
  'litro',
  'minuto',
  'hora',
  'cliente',
  'venta',
  'servicio',
  'otro',
];

const CATEGORY_SET = new Set(COST_LIBRARY_CATEGORIES);
const CALCULATION_TYPE_SET = new Set(COST_LIBRARY_CALCULATION_TYPES);
const PRODUCT_TYPE_SET = new Set(COST_LIBRARY_PRODUCT_TYPES);
const BILLING_PERIOD_SET = new Set(COST_LIBRARY_BILLING_PERIODS);
const USAGE_UNIT_SET = new Set(COST_LIBRARY_USAGE_UNITS);

export const DEFAULT_COST_LIBRARY_ITEM = {
  id: null,
  name: '',
  description: '',
  category: 'otro',
  calculationType: 'fixed',
  appliesToProductTypes: [...COST_LIBRARY_PRODUCT_TYPES],
  isActive: true,
  fixedAmount: 0,
  purchaseCost: 0,
  purchaseQuantity: 0,
  usageUnit: 'unidad',
  wastePercentage: 0,
  hourlyRate: 0,
  percentageRate: 0,
  fixedFee: 0,
  monthlyCost: 0,
  annualCost: 0,
  estimatedMonthlyAllocations: 0,
  estimatedAnnualAllocations: 0,
  billingPeriod: 'per_sale',
  provider: '',
  notes: '',
  lastCostUpdate: null,
};

/**
 * Estructura base de un costo reutilizable.
 *
 * Campos principales:
 * - id, name, description, category, calculationType, appliesToProductTypes, isActive
 *
 * Campos economicos opcionales:
 * - fixedAmount, purchaseCost, purchaseQuantity, usageUnit, wastePercentage
 * - hourlyRate, percentageRate, fixedFee
 * - monthlyCost, annualCost, estimatedMonthlyAllocations, estimatedAnnualAllocations
 * - billingPeriod
 *
 * Campos informativos opcionales:
 * - provider, notes, lastCostUpdate
 */
export const COST_LIBRARY_ITEM_STRUCTURE = { ...DEFAULT_COST_LIBRARY_ITEM };

function toSafeNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toValidationNumber(value) {
  if (value === '' || value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function toNonNegativeNumber(value) {
  return Math.max(0, toSafeNumber(value));
}

function normalizeString(value) {
  return `${value ?? ''}`.trim();
}

function normalizeEnum(value, allowedSet, fallback) {
  const normalized = normalizeString(value).toLowerCase();
  return allowedSet.has(normalized) ? normalized : fallback;
}

function normalizeProductTypes(value) {
  const rawValues = Array.isArray(value)
    ? value
    : normalizeString(value)
      ? [value]
      : [];

  const normalized = rawValues
    .map((item) => normalizeString(item).toLowerCase())
    .filter((item) => PRODUCT_TYPE_SET.has(item));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...COST_LIBRARY_PRODUCT_TYPES];
}

function addError(errors, field, message) {
  return {
    ...errors,
    [field]: message,
  };
}

export function normalizeCostLibraryItem(item = {}) {
  const source = item && typeof item === 'object' ? item : {};

  return {
    id: source.id ?? null,
    name: normalizeString(source.name),
    description: normalizeString(source.description),
    category: normalizeEnum(source.category, CATEGORY_SET, DEFAULT_COST_LIBRARY_ITEM.category),
    calculationType: normalizeEnum(
      source.calculationType,
      CALCULATION_TYPE_SET,
      DEFAULT_COST_LIBRARY_ITEM.calculationType
    ),
    appliesToProductTypes: normalizeProductTypes(source.appliesToProductTypes),
    isActive: source.isActive !== false,
    fixedAmount: toNonNegativeNumber(source.fixedAmount),
    purchaseCost: toNonNegativeNumber(source.purchaseCost),
    purchaseQuantity: toNonNegativeNumber(source.purchaseQuantity),
    usageUnit: normalizeEnum(source.usageUnit, USAGE_UNIT_SET, DEFAULT_COST_LIBRARY_ITEM.usageUnit),
    wastePercentage: toNonNegativeNumber(source.wastePercentage),
    hourlyRate: toNonNegativeNumber(source.hourlyRate),
    percentageRate: toNonNegativeNumber(source.percentageRate),
    fixedFee: toNonNegativeNumber(source.fixedFee),
    monthlyCost: toNonNegativeNumber(source.monthlyCost),
    annualCost: toNonNegativeNumber(source.annualCost),
    estimatedMonthlyAllocations: toNonNegativeNumber(source.estimatedMonthlyAllocations),
    estimatedAnnualAllocations: toNonNegativeNumber(source.estimatedAnnualAllocations),
    billingPeriod: normalizeEnum(source.billingPeriod, BILLING_PERIOD_SET, DEFAULT_COST_LIBRARY_ITEM.billingPeriod),
    provider: normalizeString(source.provider),
    notes: normalizeString(source.notes),
    lastCostUpdate: source.lastCostUpdate || null,
  };
}

export function validateCostLibraryItem(item = {}) {
  const source = item && typeof item === 'object' ? item : {};
  const normalized = normalizeCostLibraryItem(item);
  const rawCategory = normalizeString(source.category).toLowerCase();
  const rawCalculationType = normalizeString(source.calculationType).toLowerCase();
  const rawProductTypes = Array.isArray(source.appliesToProductTypes)
    ? source.appliesToProductTypes
    : normalizeString(source.appliesToProductTypes)
      ? [source.appliesToProductTypes]
      : [];
  let errors = {};

  if (!normalized.name) {
    errors = addError(errors, 'name', 'El nombre es requerido.');
  }

  if (!rawCategory || !CATEGORY_SET.has(rawCategory)) {
    errors = addError(errors, 'category', 'La categoria no es valida.');
  }

  if (!rawCalculationType || !CALCULATION_TYPE_SET.has(rawCalculationType)) {
    errors = addError(errors, 'calculationType', 'El tipo de calculo no es valido.');
  }

  if (rawProductTypes.length === 0) {
    errors = addError(errors, 'appliesToProductTypes', 'Selecciona al menos un tipo de producto.');
  }

  const hasInvalidProductType = rawProductTypes
    .map((type) => normalizeString(type).toLowerCase())
    .some((type) => !PRODUCT_TYPE_SET.has(type));
  if (hasInvalidProductType) {
    errors = addError(errors, 'appliesToProductTypes', 'Hay tipos de producto no validos.');
  }

  const fixedAmount = toValidationNumber(source.fixedAmount);
  const purchaseCost = toValidationNumber(source.purchaseCost);
  const purchaseQuantity = toValidationNumber(source.purchaseQuantity);
  const hourlyRate = toValidationNumber(source.hourlyRate);
  const percentageRate = toValidationNumber(source.percentageRate);
  const monthlyCost = toValidationNumber(source.monthlyCost);
  const annualCost = toValidationNumber(source.annualCost);
  const estimatedMonthlyAllocations = toValidationNumber(source.estimatedMonthlyAllocations);
  const estimatedAnnualAllocations = toValidationNumber(source.estimatedAnnualAllocations);

  if (normalized.calculationType === 'fixed' && (!Number.isFinite(fixedAmount) || fixedAmount < 0)) {
    errors = addError(errors, 'fixedAmount', 'El monto fijo debe ser mayor o igual a 0.');
  }

  if (normalized.calculationType === 'per_unit') {
    if (!Number.isFinite(purchaseCost) || purchaseCost < 0) {
      errors = addError(errors, 'purchaseCost', 'El costo de compra debe ser mayor o igual a 0.');
    }
    if (!Number.isFinite(purchaseQuantity) || purchaseQuantity <= 0) {
      errors = addError(errors, 'purchaseQuantity', 'La cantidad comprada debe ser mayor que 0.');
    }
    if (!normalizeString(source.usageUnit) || !USAGE_UNIT_SET.has(normalizeString(source.usageUnit).toLowerCase())) {
      errors = addError(errors, 'usageUnit', 'La unidad de consumo es requerida.');
    }
  }

  if (normalized.calculationType === 'hourly' && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
    errors = addError(errors, 'hourlyRate', 'La tarifa por hora debe ser mayor o igual a 0.');
  }

  if (normalized.calculationType === 'percentage' && (!Number.isFinite(percentageRate) || percentageRate < 0)) {
    errors = addError(errors, 'percentageRate', 'El porcentaje debe ser mayor o igual a 0.');
  }

  if (normalized.calculationType === 'monthly_prorated') {
    if (!Number.isFinite(monthlyCost) || monthlyCost < 0) {
      errors = addError(errors, 'monthlyCost', 'El costo mensual debe ser mayor o igual a 0.');
    }
    if (!Number.isFinite(estimatedMonthlyAllocations) || estimatedMonthlyAllocations <= 0) {
      errors = addError(errors, 'estimatedMonthlyAllocations', 'Las asignaciones mensuales deben ser mayores que 0.');
    }
  }

  if (normalized.calculationType === 'annual_prorated') {
    if (!Number.isFinite(annualCost) || annualCost < 0) {
      errors = addError(errors, 'annualCost', 'El costo anual debe ser mayor o igual a 0.');
    }
    if (!Number.isFinite(estimatedAnnualAllocations) || estimatedAnnualAllocations <= 0) {
      errors = addError(errors, 'estimatedAnnualAllocations', 'Las asignaciones anuales deben ser mayores que 0.');
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function calculateLibraryItemUnitCost(item = {}, context = {}) {
  const normalized = normalizeCostLibraryItem(item);
  const quantity = toNonNegativeNumber(context.quantity || 1);
  const hours = toNonNegativeNumber(context.hours || 1);
  const salePrice = toNonNegativeNumber(context.salePrice);
  const contextAllocations = toNonNegativeNumber(context.allocations);
  const wastePercentage = context.wastePercentageOverride == null
    ? normalized.wastePercentage
    : toNonNegativeNumber(context.wastePercentageOverride);

  let baseAmount = 0;
  let wasteAmount = 0;
  let fixedFeeAmount = 0;

  if (normalized.calculationType === 'fixed') {
    baseAmount = normalized.fixedAmount;
  }

  if (normalized.calculationType === 'per_unit' && normalized.purchaseQuantity > 0) {
    const subtotal = (normalized.purchaseCost / normalized.purchaseQuantity) * quantity;
    wasteAmount = subtotal * (wastePercentage / 100);
    baseAmount = subtotal;
  }

  if (normalized.calculationType === 'hourly') {
    baseAmount = normalized.hourlyRate * hours;
  }

  if (normalized.calculationType === 'percentage') {
    baseAmount = salePrice * (normalized.percentageRate / 100);
    fixedFeeAmount = normalized.fixedFee;
  }

  if (normalized.calculationType === 'monthly_prorated') {
    const allocations = contextAllocations > 0 ? contextAllocations : normalized.estimatedMonthlyAllocations;
    baseAmount = allocations > 0 ? normalized.monthlyCost / allocations : 0;
  }

  if (normalized.calculationType === 'annual_prorated') {
    const allocations = contextAllocations > 0 ? contextAllocations : normalized.estimatedAnnualAllocations;
    baseAmount = allocations > 0 ? normalized.annualCost / allocations : 0;
  }

  const computedAmount = Math.max(0, baseAmount + wasteAmount + fixedFeeAmount);

  return {
    baseAmount: Math.max(0, baseAmount),
    wasteAmount: Math.max(0, wasteAmount),
    fixedFeeAmount: Math.max(0, fixedFeeAmount),
    computedAmount,
  };
}
