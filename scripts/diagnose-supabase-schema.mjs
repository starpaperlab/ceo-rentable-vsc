#!/usr/bin/env node

import fs from 'node:fs';

function loadEnv(filePath = '.env.local') {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

const env = { ...loadEnv('.env.local'), ...process.env };
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local');
  process.exit(1);
}

const checks = {
  users: ['id', 'email', 'full_name', 'phone', 'role', 'plan', 'has_access', 'onboarding_completed', 'currency', 'timezone', 'last_login_at', 'updated_at'],
  products: ['id', 'user_id', 'created_by', 'name', 'sale_price', 'costo_unitario', 'margin_pct', 'product_type', 'status', 'created_at', 'updated_at'],
  clients: ['id', 'user_id', 'created_by', 'name', 'status', 'total_billed', 'created_at', 'updated_at'],
  monthly_records: ['id', 'user_id', 'created_by', 'month', 'income', 'expenses', 'profit', 'margin_pct', 'is_closed', 'created_at', 'updated_at'],
  appointments: ['id', 'user_id', 'created_by', 'client_name', 'service_type', 'date', 'status', 'created_at', 'updated_at'],
  invoices: ['id', 'user_id', 'created_by', 'invoice_number', 'line_items', 'subtotal', 'tax_amount', 'total_final', 'status', 'created_at', 'updated_at'],
  quotes: ['id', 'user_id', 'created_by', 'quote_number', 'line_items', 'subtotal', 'tax_amount', 'total_final', 'status', 'created_at', 'updated_at'],
  inventory_items: ['id', 'user_id', 'created_by', 'product_name', 'current_stock', 'min_stock_alert', 'created_at', 'updated_at'],
  inventory_movements: ['id', 'user_id', 'created_by', 'inventory_item_id', 'type', 'quantity', 'date', 'created_at', 'updated_at'],
  business_config: ['id', 'user_id', 'created_by', 'business_name', 'logo_url', 'brand_color', 'font_family', 'currency', 'quarterly_goal', 'target_margin_pct', 'created_at', 'updated_at'],
  product_analysis: ['id', 'user_id', 'created_by', 'name', 'sale_price', 'cost', 'margin_pct', 'status', 'created_at', 'updated_at'],
};

async function probe(table, column) {
  const endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(column)}&limit=1`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

const missing = [];

for (const [table, columns] of Object.entries(checks)) {
  for (const column of columns) {
    const result = await probe(table, column);
    if (!result.ok) {
      missing.push({ table, column, status: result.status, error: result.body?.message || JSON.stringify(result.body) });
    }
  }
}

if (missing.length === 0) {
  console.log('OK: esquema base detectado para todos los módulos críticos.');
  process.exit(0);
}

console.log('Faltantes detectados en Supabase:');
for (const item of missing) {
  console.log(`- ${item.table}.${item.column} [${item.status}] -> ${item.error}`);
}

console.log(`\nTotal faltantes: ${missing.length}`);
process.exit(2);
