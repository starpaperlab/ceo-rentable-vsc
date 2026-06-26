import { getImportType } from '@/lib/importTemplates';

function toNumber(value) {
  if (value == null || `${value}`.trim() === '') return null;
  const normalized = `${value}`.replace(/,/g, '').trim();
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function isValidDate(value) {
  if (!value) return true;
  const date = new Date(`${value}`);
  return !Number.isNaN(date.getTime());
}

export function applyColumnMapping(rows = [], mapping = {}) {
  return rows.map((row) => {
    const mapped = Object.entries(mapping).reduce((acc, [fieldKey, sourceColumn]) => {
      acc[fieldKey] = sourceColumn ? row.raw?.[sourceColumn] ?? '' : '';
      return acc;
    }, {});

    return {
      ...row,
      mapped,
    };
  });
}

export function validateMappedRows(typeKey, rows = []) {
  const type = getImportType(typeKey);

  return rows.map((row) => {
    const errors = [];
    const warnings = [];

    type.fields.forEach((field) => {
      const value = row.mapped?.[field.key];
      const empty = `${value ?? ''}`.trim() === '';

      if (field.required && empty) {
        errors.push(`${field.label} es requerido.`);
        return;
      }

      if (!empty && field.type === 'number' && toNumber(value) == null) {
        errors.push(`${field.label} debe ser numerico.`);
      }

      if (!empty && field.type === 'date' && !isValidDate(value)) {
        errors.push(`${field.label} debe ser una fecha valida.`);
      }
    });

    if (typeKey === 'payments' && row.mapped?.amount && toNumber(row.mapped.amount) <= 0) {
      errors.push('Monto debe ser mayor que cero.');
    }

    if ((typeKey === 'orders' || typeKey === 'invoices') && row.mapped?.quantity && toNumber(row.mapped.quantity) <= 0) {
      errors.push('Cantidad debe ser mayor que cero.');
    }

    if (typeKey === 'products' && row.mapped?.sale_price && toNumber(row.mapped.sale_price) < 0) {
      errors.push('Precio venta no puede ser negativo.');
    }

    if (typeKey === 'clients' && !row.mapped?.email && !row.mapped?.phone) {
      warnings.push('Sin email ni telefono sera mas dificil detectar duplicados en fases posteriores.');
    }

    return {
      ...row,
      errors,
      warnings,
      isValid: errors.length === 0,
    };
  });
}

export function getValidationSummary(rows = [], parserErrors = []) {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.isValid).length,
    errorRows: rows.filter((row) => row.errors?.length > 0).length,
    warningRows: rows.filter((row) => row.warnings?.length > 0).length,
    parserErrors: parserErrors.length,
  };
}
