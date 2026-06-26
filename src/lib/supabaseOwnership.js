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

function applyBrandProfileScope(query, { brandProfileId, includeUnbranded = true } = {}) {
  if (!brandProfileId) return query;

  if (includeUnbranded) {
    return query.or(`brand_profile_id.eq.${brandProfileId},brand_profile_id.is.null`);
  }

  return query.eq('brand_profile_id', brandProfileId);
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
  brandProfileId = null,
  includeUnbranded = true,
}) {
  if (!table) throw new Error('Tabla requerida para fetchOwnedRows');

  if (!adminMode && !ownerId && !ownerEmail) {
    return [];
  }

  if (adminMode) {
    const adminQuery = applyBrandProfileScope(
      applyEqFilters(
        supabase.from(table).select('*'),
        filters
      ),
      { brandProfileId, includeUnbranded }
    );
    const { data, error } = await adminQuery;
    if (isMissingTableError(error, table)) return [];
    if (isMissingColumnError(error, `${table}.brand_profile_id`) || isMissingColumnError(error, 'brand_profile_id')) {
      const fallbackQuery = applyEqFilters(
        supabase.from(table).select('*'),
        filters
      );
      const fallbackResult = await fallbackQuery;
      if (isMissingTableError(fallbackResult.error, table)) return [];
      if (fallbackResult.error) throw fallbackResult.error;
      return sortRows(fallbackResult.data || [], orderBy, ascending);
    }
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
    const queryById = applyBrandProfileScope(
      applyEqFilters(
        supabase.from(table).select('*').eq('user_id', ownerId),
        filters
      ),
      { brandProfileId, includeUnbranded }
    );
    const { data, error } = await queryById;
    if (error) {
      if (isMissingTableError(error, table)) return [];
      if (isMissingColumnError(error, `${table}.brand_profile_id`) || isMissingColumnError(error, 'brand_profile_id')) {
        const fallbackQuery = applyEqFilters(
          supabase.from(table).select('*').eq('user_id', ownerId),
          filters
        );
        const fallbackResult = await fallbackQuery;
        if (isMissingTableError(fallbackResult.error, table)) return [];
        if (fallbackResult.error) {
          if (!isMissingColumnError(fallbackResult.error, `${table}.user_id`) && !isMissingColumnError(fallbackResult.error, 'user_id')) {
            throw fallbackResult.error;
          }
          missingOwnerColumnCount += 1;
        } else {
          ownerIdQuerySucceeded = true;
          allRows.push(...(fallbackResult.data || []));
          if (!allowLegacyEmailFallback || !ownerEmail || (fallbackResult.data || []).length > 0) {
            return sortRows(mergeRowsById(allRows), orderBy, ascending);
          }
        }
        return sortRows(mergeRowsById(allRows), orderBy, ascending);
      }
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
    const queryByEmail = applyBrandProfileScope(
      applyEqFilters(
        supabase.from(table).select('*').eq('created_by', ownerEmail),
        filters
      ),
      { brandProfileId, includeUnbranded }
    );
    const { data, error } = await queryByEmail;
    if (error) {
      if (isMissingTableError(error, table)) return [];
      if (isMissingColumnError(error, `${table}.brand_profile_id`) || isMissingColumnError(error, 'brand_profile_id')) {
        const fallbackQuery = applyEqFilters(
          supabase.from(table).select('*').eq('created_by', ownerEmail),
          filters
        );
        const fallbackResult = await fallbackQuery;
        if (isMissingTableError(fallbackResult.error, table)) return [];
        if (fallbackResult.error) {
          if (!isMissingColumnError(fallbackResult.error, `${table}.created_by`) && !isMissingColumnError(fallbackResult.error, 'created_by')) {
            throw fallbackResult.error;
          }
          missingOwnerColumnCount += 1;
        } else {
          allRows.push(...(fallbackResult.data || []));
        }
        return sortRows(mergeRowsById(allRows), orderBy, ascending);
      }
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

  // Seguridad: nunca devolver filas sin filtro de ownership.
  // Si no hay columnas de ownership disponibles o fallan ambas estrategias,
  // devolvemos vacío para evitar mezclar datos entre usuarias.
  return [];
}

export function resolveWorkContextOwnership({
  ownerId,
  ownerEmail,
  adminMode = false,
  activeView,
  activeUserId,
  activeUser,
}) {
  if (!adminMode) {
    return {
      ownerId,
      ownerEmail,
      adminMode: false,
    };
  }

  if (activeView === 'all_users') {
    return {
      ownerId,
      ownerEmail,
      adminMode: true,
    };
  }

  if (activeView === 'specific_user' && activeUserId) {
    return {
      ownerId: activeUserId,
      ownerEmail: `${activeUser?.email || ''}`.trim().toLowerCase(),
      adminMode: false,
    };
  }

  return {
    ownerId,
    ownerEmail,
    adminMode: false,
  };
}

export function withOwner(payload, { ownerId, ownerEmail }) {
  return {
    ...payload,
    user_id: ownerId || null,
    created_by: ownerEmail || null,
  };
}

function assertOwnerContext({ ownerId, ownerEmail, adminMode }) {
  if (adminMode) return;
  if (ownerId) return;
  if (ownerEmail) return;
  throw new Error('Sesión sin contexto de propiedad (owner). Recarga e intenta de nuevo.');
}

async function runScopedMutation({
  table,
  id,
  mode, // 'update' | 'delete'
  payload = null,
  ownerId,
  ownerEmail,
  adminMode = false,
}) {
  if (!table) throw new Error('Tabla requerida');
  if (!id) throw new Error('ID requerido');

  assertOwnerContext({ ownerId, ownerEmail, adminMode });

  const run = async (ownerColumn, ownerValue) => {
    let query = supabase.from(table);
    query = mode === 'update' ? query.update(payload) : query.delete();
    query = query.eq('id', id);
    if (ownerColumn && ownerValue) {
      query = query.eq(ownerColumn, ownerValue);
    }
    const { data, error } = await query.select('id');
    if (error) throw error;
    return data || [];
  };

  if (adminMode) {
    const rows = await run(null, null);
    if (rows.length === 0) {
      throw new Error('Registro no encontrado.');
    }
    return rows[0];
  }

  if (ownerId) {
    try {
      const rows = await run('user_id', ownerId);
      if (rows.length > 0) return rows[0];
    } catch (error) {
      if (!isMissingColumnError(error, `${table}.user_id`) && !isMissingColumnError(error, 'user_id')) {
        throw error;
      }
    }
  }

  if (ownerEmail) {
    try {
      const rows = await run('created_by', ownerEmail);
      if (rows.length > 0) return rows[0];
    } catch (error) {
      if (!isMissingColumnError(error, `${table}.created_by`) && !isMissingColumnError(error, 'created_by')) {
        throw error;
      }
    }
  }

  throw new Error('No autorizado o registro no encontrado para tu cuenta.');
}

export async function updateOwnedRowById({
  table,
  id,
  payload,
  ownerId,
  ownerEmail,
  adminMode = false,
}) {
  return runScopedMutation({
    table,
    id,
    mode: 'update',
    payload,
    ownerId,
    ownerEmail,
    adminMode,
  });
}

export async function deleteOwnedRowById({
  table,
  id,
  ownerId,
  ownerEmail,
  adminMode = false,
}) {
  return runScopedMutation({
    table,
    id,
    mode: 'delete',
    ownerId,
    ownerEmail,
    adminMode,
  });
}
