export const PRODUCT_TYPES = {
  PHYSICAL: 'physical',
  DIGITAL: 'digital',
  SERVICE: 'service',
  BUNDLE: 'bundle',
};

const PRODUCT_TYPE_ALIASES = {
  [PRODUCT_TYPES.PHYSICAL]: PRODUCT_TYPES.PHYSICAL,
  fisico: PRODUCT_TYPES.PHYSICAL,
  físico: PRODUCT_TYPES.PHYSICAL,
  producto_fisico: PRODUCT_TYPES.PHYSICAL,
  producto_físico: PRODUCT_TYPES.PHYSICAL,
  [PRODUCT_TYPES.DIGITAL]: PRODUCT_TYPES.DIGITAL,
  digital: PRODUCT_TYPES.DIGITAL,
  producto_digital: PRODUCT_TYPES.DIGITAL,
  [PRODUCT_TYPES.SERVICE]: PRODUCT_TYPES.SERVICE,
  servicio: PRODUCT_TYPES.SERVICE,
  [PRODUCT_TYPES.BUNDLE]: PRODUCT_TYPES.BUNDLE,
  combo: PRODUCT_TYPES.BUNDLE,
  paquete: PRODUCT_TYPES.BUNDLE,
};

const PRODUCT_TYPE_DB_MAP = {
  [PRODUCT_TYPES.PHYSICAL]: 'fisico',
  [PRODUCT_TYPES.DIGITAL]: 'digital',
  [PRODUCT_TYPES.SERVICE]: 'servicio',
  [PRODUCT_TYPES.BUNDLE]: 'combo',
};

export function normalizeProductType(value) {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return PRODUCT_TYPE_ALIASES[normalized] || PRODUCT_TYPES.PHYSICAL;
}

export function toProductTypeDb(value) {
  return PRODUCT_TYPE_DB_MAP[normalizeProductType(value)] || PRODUCT_TYPE_DB_MAP[PRODUCT_TYPES.PHYSICAL];
}

export function isPhysicalProductType(value) {
  return normalizeProductType(value) === PRODUCT_TYPES.PHYSICAL;
}

export function isDigitalProductType(value) {
  return normalizeProductType(value) === PRODUCT_TYPES.DIGITAL;
}

export function isServiceProductType(value) {
  return normalizeProductType(value) === PRODUCT_TYPES.SERVICE;
}

export function isBundleProductType(value) {
  return normalizeProductType(value) === PRODUCT_TYPES.BUNDLE;
}

export function getProductTypeLabel(value, { long = false } = {}) {
  const type = normalizeProductType(value);
  if (type === PRODUCT_TYPES.DIGITAL) {
    return long ? 'Producto digital' : 'Digital';
  }
  if (type === PRODUCT_TYPES.SERVICE) {
    return 'Servicio';
  }
  if (type === PRODUCT_TYPES.BUNDLE) {
    return 'Combo / paquete';
  }
  return long ? 'Producto físico' : 'Físico';
}
