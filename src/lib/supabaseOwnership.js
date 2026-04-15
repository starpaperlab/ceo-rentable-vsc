import { supabase } from '@/lib/supabase';

function normalizeErrorText(error) {
  return `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
}

function extractColumnName(columnRef = '') {
  const cleaned = `${columnRef}`.replace(/"/g, '').trim().toLowerCase();
  if (!cleaned) return '';
  const parts = cleaned.split('.');
  return parts[parts.length - 1] || cleaned;
}

export function isMissingColumnError(error, columnRef = '') {
  if (!error) return false;

  const text = normalizeErrorText(error);
  const column = extractColumnName(columnRef);
  const qualified = `${columnRef}`.replace(/"/g, '').trim().toLowerCase();

  const hasUndefinedColumnCode = error?.code === '42703' || error?.code === 'PGRST204';
  const hasMissingMessage =
    text.includes('does not exist') ||
    text.includes('undefined column') ||
    (text.includes('could not find') && text.includes('column') && text.includes('schema cache'));
  if (!hasUndefinedColumnCode && !hasMissingMessage) return false;

  if (!column) return hasUndefinedColumnCode || hasMissingMessage;

  return (
    text.includes(`column ${qualified}`) ||
    text.includes(`column "${qualified}"`) ||
    text.includes(`column ${column}`) ||
    text.includes(`column "${column}"`) ||
    text.includes(`'${column}' column`) ||
    text.includes(`"${column}" column`) ||
    text.includes(` ${column} column`) ||
    text.includes(`${qualified} does not exist`) ||
    text.includes(`${column} does not exist`)
  );
}

export function extractMissingColumnFromError(error) {
  if (!error) return null;
  const raw = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;

  const patterns = [
    /could not find the '([^']+)' column of '[^']+' in the schema cache/i,
    /column "?([a-zA-Z0-9_.]+)"? of relation "?[a-zA-Z0-9_]+"? does not exist/i,
    /column "?([a-zA-Z0-9_.]+)"? does not exist/i,
    /undefined column: ?"?([a-zA-Z0-9_.]+)"?/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const column = extractColumnName(match[1]);
      if (column) return column;
    }
  }

  return null;
}

export function hasOwnerConstraintIssue(error, tableName = '') {
  const text = normalizeErrorText(error);
  const table = `${tableName}`.toLowerCase();

  return (
    error?.code === '23503' ||
    error?.code === '23502' ||
    (table && text.includes(table) && text.includes('user_id')) ||
    text.includes('foreign key') && text.includes('user_id') ||
    text.includes('null value in column') && text.includes('user_id')
  );
}

export function isMissingTableError(error, tableName = '') {
  const text = normalizeErrorText(error);
  const table = `${tableName}`.toLowerCase();
  return (
    error?.code === 'PGRST205' ||
    text.includes('could not find the table') ||
    (table && text.includes(`table 'public.${table}'`))
  );
}

function applyEqFilters(query, filters = []) {
  return filters.reduce((acc, filter) => {
    if (!filter?.column) return acc;
    return acc.eq(filter.column, filter.value);
  }, query);
}

function sortRows(rows = [], orderBy = 'created_at', ascending = false) {
  if (!orderBy) return rows;

  return [...rows].sort((a, b) => {
    const av = a?.[orderBy];
    const bv = b?.[orderBy];

    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    const ad = new Date(av);
    const bd = new Date(bv);
    const adTime = ad.getTime();
    const bdTime = bd.getTime();

    let diff;
    if (!Number.isNaN(adTime) && !Number.isNaN(bdTime)) {
      diff = adTime - bdTime;
    } else if (typeof av === 'number' && typeof bv === 'number') {
      diff = av - bv;
    } else {
      diff = `${av}`.localeCompare(`${bv}`);
    }

    return ascending ? diff : -diff;
  });
}

function mergeRowsById(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row?.id ?? JSON.stringify(row);
    if (!map.has(key)) map.set(key, row);
  });
  return Array.from(map.values());
}

export async function fetchOwnedRows({
  table,
  ownerId,
  ownerEmail,
  adminMode = false,
  orderBy = 'created_at',
  ascending = false,
  filters = [],
  allowLegacyEmailFallback = false,
}) {
  if (!table) throw new Error('Tabla requerida para fetchOwnedRows');

  if (!adminMode && !ownerId) {
    return [];
  }

  if (adminMode) {
    const adminQuery = applyEqFilters(
      supabase.from(table).select('*'),
      filters
    );
    const { data, error } = await adminQuery;
    if (isMissingTableError(error, table)) return [];
    if (!error) {
      return sortRows(data || [], orderBy, ascending);
    }
  }

  const allRows = [];
  let attempted = 0;
  let missingOwnerColumnCount = 0;
  let ownerIdQuerySucceeded = false;

  if (ownerId) {
    attempted += 1;
    const queryById = applyEqFilters(
      supabase.from(table).select('*').eq('user_id', ownerId),
      filters
    );
    const { data, error } = await queryById;
    if (error) {
      if (isMissingTableError(error, table)) return [];
      if (!isMissingColumnError(error, `${table}.user_id`) && !isMissingColumnError(error, 'user_id')) {
        throw error;
      }
      missingOwnerColumnCount += 1;
    } else {
      ownerIdQuerySucceeded = true;
      allRows.push(...(data || []));
      if (!allowLegacyEmailFallback || !ownerEmail || (data || []).length > 0) {
        return sortRows(mergeRowsById(allRows), orderBy, ascending);
      }
    }
  }

  if (ownerEmail && (!ownerIdQuerySucceeded || allowLegacyEmailFallback)) {
    attempted += 1;
    const queryByEmail = applyEqFilters(
      supabase.from(table).select('*').eq('created_by', ownerEmail),
      filters
    );
    const { data, error } = await queryByEmail;
    if (error) {
      if (isMissingTableError(error, table)) return [];
      if (!isMissingColumnError(error, `${table}.created_by`) && !isMissingColumnError(error, 'created_by')) {
        throw error;
      }
      missingOwnerColumnCount += 1;
    } else {
      allRows.push(...(data || []));
    }
  }

  if (allRows.length > 0) {
    return sortRows(mergeRowsById(allRows), orderBy, ascending);
  }

  if (ownerIdQuerySucceeded) {
    return [];
  }

  if (attempted > 0 && missingOwnerColumnCount !== attempted) {
    return [];
  }

  const fallbackQuery = applyEqFilters(
    supabase.from(table).select('*'),
    filters
  );
  const { data, error } = await fallbackQuery;
  if (isMissingTableError(error, table)) return [];
  if (error) throw error;
  return sortRows(data || [], orderBy, ascending);
}

export function withOwner(payload, { ownerId, ownerEmail }) {
  return {
    ...payload,
    user_id: ownerId || null,
    created_by: ownerEmail || null,
  };
}
