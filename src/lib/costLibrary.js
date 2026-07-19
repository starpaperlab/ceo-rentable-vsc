import { supabase } from '@/lib/supabase';
import {
  normalizeCostLibraryItem,
  validateCostLibraryItem,
} from '@/lib/costLibraryTypes';

const COST_LIBRARY_TABLE = 'cost_library_items';

const FIELD_MAP = {
  id: 'id',
  userId: 'user_id',
  createdBy: 'created_by',
  name: 'name',
  description: 'description',
  category: 'category',
  calculationType: 'calculation_type',
  appliesToProductTypes: 'applies_to_product_types',
  isActive: 'is_active',
  fixedAmount: 'fixed_amount',
  purchaseCost: 'purchase_cost',
  purchaseQuantity: 'purchase_quantity',
  usageUnit: 'usage_unit',
  wastePercentage: 'waste_percentage',
  hourlyRate: 'hourly_rate',
  percentageRate: 'percentage_rate',
  fixedFee: 'fixed_fee',
  monthlyCost: 'monthly_cost',
  annualCost: 'annual_cost',
  estimatedMonthlyAllocations: 'estimated_monthly_allocations',
  estimatedAnnualAllocations: 'estimated_annual_allocations',
  billingPeriod: 'billing_period',
  provider: 'provider',
  notes: 'notes',
  lastCostUpdate: 'last_cost_update',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const REVERSE_FIELD_MAP = Object.entries(FIELD_MAP).reduce((map, [camelKey, snakeKey]) => ({
  ...map,
  [snakeKey]: camelKey,
}), {});

const READ_ONLY_FIELDS = new Set(['id', 'userId', 'createdBy', 'createdAt', 'updatedAt']);
const WRITABLE_FIELDS = Object.keys(FIELD_MAP).filter((field) => !READ_ONLY_FIELDS.has(field));
const WRITABLE_FIELD_SET = new Set(WRITABLE_FIELDS);

const ORDER_FIELD_MAP = {
  name: 'name',
  category: 'category',
  calculationType: 'calculation_type',
  isActive: 'is_active',
  provider: 'provider',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  lastCostUpdate: 'last_cost_update',
};

function toSnakeCaseRecord(record = {}, { includeReadOnly = true } = {}) {
  if (!record || typeof record !== 'object') return {};

  return Object.entries(record).reduce((payload, [key, value]) => {
    if (!includeReadOnly && READ_ONLY_FIELDS.has(key)) return payload;
    const mappedKey = FIELD_MAP[key];
    if (!mappedKey) return payload;
    return {
      ...payload,
      [mappedKey]: value,
    };
  }, {});
}

function toCamelCaseRecord(record = {}) {
  if (!record || typeof record !== 'object') return null;

  return Object.entries(record).reduce((payload, [key, value]) => {
    const mappedKey = REVERSE_FIELD_MAP[key] || key;
    return {
      ...payload,
      [mappedKey]: value,
    };
  }, {});
}

function normalizeDbRecord(record) {
  if (!record) return null;
  const camel = toCamelCaseRecord(record);
  return {
    ...normalizeCostLibraryItem(camel),
    id: camel.id || null,
    userId: camel.userId || null,
    createdBy: camel.createdBy || null,
    createdAt: camel.createdAt || null,
    updatedAt: camel.updatedAt || null,
  };
}

function createValidationError(validation) {
  const error = new Error('El costo reutilizable no es válido.');
  error.name = 'CostLibraryValidationError';
  error.valid = false;
  error.errors = validation.errors || {};
  error.validation = {
    valid: false,
    errors: error.errors,
  };
  return error;
}

function assertValidCostLibraryItem(item) {
  const validation = validateCostLibraryItem(item);
  if (!validation.valid) {
    throw createValidationError(validation);
  }
}

function assertId(id) {
  if (!`${id || ''}`.trim()) {
    throw new Error('ID de costo reutilizable requerido.');
  }
}

function normalizeBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} debe ser boolean.`);
  }
  return value;
}

function getAllowedChanges(changes = {}) {
  if (!changes || typeof changes !== 'object') return {};

  return Object.entries(changes).reduce((payload, [key, value]) => {
    if (!WRITABLE_FIELD_SET.has(key)) return payload;
    return {
      ...payload,
      [key]: value,
    };
  }, {});
}

function getOrderByField(orderBy) {
  if (!orderBy) return ORDER_FIELD_MAP.name;
  return ORDER_FIELD_MAP[orderBy] || ORDER_FIELD_MAP.name;
}

function sanitizeSearch(value = '') {
  return `${value || ''}`
    .trim()
    .replace(/[%_]/g, '\\$&')
    .replace(/,/g, ' ');
}

function handleSupabaseError(error, action) {
  if (!error) return;
  const wrappedError = new Error(`No se pudo ${action}: ${error.message}`);
  wrappedError.code = error.code;
  wrappedError.details = error.details;
  wrappedError.hint = error.hint;
  throw wrappedError;
}

function buildInsertPayload(item) {
  const normalized = normalizeCostLibraryItem(item);
  assertValidCostLibraryItem(normalized);
  return toSnakeCaseRecord(normalized, { includeReadOnly: false });
}

export async function listCostLibraryItems(options = {}) {
  const {
    category,
    productType,
    calculationType,
    isActive,
    search,
    limit,
    orderBy = 'name',
    ascending = true,
  } = options;

  let query = supabase
    .from(COST_LIBRARY_TABLE)
    .select('*')
    .order(getOrderByField(orderBy), { ascending: ascending !== false });

  if (category) {
    query = query.eq('category', category);
  }

  if (calculationType) {
    query = query.eq('calculation_type', calculationType);
  }

  if (typeof isActive === 'boolean') {
    query = query.eq('is_active', isActive);
  }

  if (productType) {
    query = query.contains('applies_to_product_types', JSON.stringify([productType]));
  }

  const normalizedSearch = sanitizeSearch(search);
  if (normalizedSearch) {
    query = query.or(`name.ilike.%${normalizedSearch}%,provider.ilike.%${normalizedSearch}%`);
  }

  const parsedLimit = Number(limit);
  if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
    query = query.limit(Math.floor(parsedLimit));
  }

  const { data, error } = await query;
  handleSupabaseError(error, 'consultar la biblioteca de costos');

  return (data || []).map(normalizeDbRecord);
}

export async function getCostLibraryItemById(id) {
  assertId(id);

  const { data, error } = await supabase
    .from(COST_LIBRARY_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  handleSupabaseError(error, 'consultar el costo reutilizable');
  return data ? normalizeDbRecord(data) : null;
}

export async function createCostLibraryItem(item) {
  const payload = buildInsertPayload(item);

  const { data, error } = await supabase
    .from(COST_LIBRARY_TABLE)
    .insert(payload)
    .select()
    .single();

  handleSupabaseError(error, 'crear el costo reutilizable');
  return normalizeDbRecord(data);
}

export async function updateCostLibraryItem(id, changes) {
  assertId(id);

  const current = await getCostLibraryItemById(id);
  if (!current) {
    throw new Error('Costo reutilizable no encontrado.');
  }

  const allowedChanges = getAllowedChanges(changes);
  const next = normalizeCostLibraryItem({
    ...current,
    ...allowedChanges,
  });
  assertValidCostLibraryItem(next);

  const payload = toSnakeCaseRecord(allowedChanges, { includeReadOnly: false });
  if (!Object.keys(payload).length) {
    return current;
  }

  const { data, error } = await supabase
    .from(COST_LIBRARY_TABLE)
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  handleSupabaseError(error, 'actualizar el costo reutilizable');
  return normalizeDbRecord(data);
}

export async function setCostLibraryItemActive(id, isActive) {
  return updateCostLibraryItem(id, {
    isActive: normalizeBoolean(isActive, 'isActive'),
  });
}

export async function deleteCostLibraryItem(id) {
  assertId(id);

  const { error } = await supabase
    .from(COST_LIBRARY_TABLE)
    .delete()
    .eq('id', id);

  handleSupabaseError(error, 'eliminar el costo reutilizable');

  return {
    success: true,
    id,
  };
}

export async function duplicateCostLibraryItem(id, overrides = {}) {
  assertId(id);

  const original = await getCostLibraryItemById(id);
  if (!original) {
    throw new Error('Costo reutilizable no encontrado.');
  }

  const allowedOverrides = getAllowedChanges(overrides);
  const duplicate = {
    ...original,
    id: null,
    userId: null,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    name: `${original.name} - Copia`,
    ...allowedOverrides,
  };

  return createCostLibraryItem(duplicate);
}
