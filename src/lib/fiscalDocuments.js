export const FISCAL_DOCUMENT_OPTIONS = {
  DO: [
    { value: 'none', label: 'Sin comprobante fiscal' },
    { value: 'do_ncf_01', label: 'NCF · Factura de Crédito Fiscal (01)' },
    { value: 'do_ncf_02', label: 'NCF · Factura de Consumo (02)' },
    { value: 'do_ncf_13', label: 'NCF · Gastos Menores (13)' },
    { value: 'do_ncf_14', label: 'NCF · Regímenes Especiales (14)' },
    { value: 'do_ncf_15', label: 'NCF · Gubernamental (15)' },
    { value: 'do_ncf_16', label: 'NCF · Exportaciones (16)' },
    { value: 'do_ncf_17', label: 'NCF · Pagos al Exterior (17)' },
    { value: 'do_ecf_31', label: 'e-CF · Crédito Fiscal Electrónico (31)' },
    { value: 'do_ecf_32', label: 'e-CF · Consumo Electrónico (32)' },
    { value: 'do_ecf_41', label: 'e-CF · Compras Electrónico (41)' },
    { value: 'do_ecf_43', label: 'e-CF · Gastos Menores Electrónico (43)' },
    { value: 'do_ecf_44', label: 'e-CF · Regímenes Especiales Electrónico (44)' },
    { value: 'do_ecf_45', label: 'e-CF · Gubernamental Electrónico (45)' },
    { value: 'custom', label: 'Otro comprobante / referencia fiscal' },
  ],
  MX: [
    { value: 'none', label: 'Sin comprobante fiscal' },
    { value: 'mx_cfdi', label: 'CFDI · Factura electrónica' },
    { value: 'custom', label: 'Otro comprobante / referencia fiscal' },
  ],
  CO: [
    { value: 'none', label: 'Sin comprobante fiscal' },
    { value: 'co_einvoice', label: 'Factura electrónica de venta' },
    { value: 'custom', label: 'Otro comprobante / referencia fiscal' },
  ],
  PE: [
    { value: 'none', label: 'Sin comprobante fiscal' },
    { value: 'pe_invoice', label: 'Factura electrónica' },
    { value: 'pe_boleta', label: 'Boleta de venta electrónica' },
    { value: 'custom', label: 'Otro comprobante / referencia fiscal' },
  ],
  DEFAULT: [
    { value: 'none', label: 'Sin comprobante fiscal' },
    { value: 'electronic_invoice', label: 'Factura electrónica' },
    { value: 'custom', label: 'Otro comprobante / referencia fiscal' },
  ],
};

export function getFiscalDocumentOptions(countryCode = 'DO') {
  return FISCAL_DOCUMENT_OPTIONS[countryCode] || FISCAL_DOCUMENT_OPTIONS.DEFAULT;
}

export function getFiscalDocumentLabel(countryCode, value) {
  return getFiscalDocumentOptions(countryCode).find((option) => option.value === value)?.label
    || FISCAL_DOCUMENT_OPTIONS.DEFAULT.find((option) => option.value === value)?.label
    || '';
}

export function getFiscalNumberLabel(countryCode = 'DO', type = '') {
  if (countryCode === 'DO') return type.startsWith('do_ecf_') ? 'e-NCF' : 'NCF';
  if (countryCode === 'MX') return 'Folio fiscal / UUID';
  if (countryCode === 'CO') return 'CUFE / referencia fiscal';
  if (countryCode === 'PE') return 'Serie y número';
  return 'Número / referencia fiscal';
}
