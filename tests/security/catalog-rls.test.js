import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../../supabase/migrations/20260913194431_phase_4_catalog_profitability.sql', import.meta.url)

test('las tablas nuevas tienen workspace, RLS y políticas por operación', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  for (const table of ['product_cost_components', 'product_bundle_items']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}[\\s\\S]*workspace_id uuid not null`, 'i'))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    for (const operation of ['select', 'insert', 'update', 'delete']) {
      assert.match(sql, new RegExp(`create policy ${table}_workspace_${operation}[\\s\\S]*for ${operation}`, 'i'))
    }
  }
})

test('las políticas exigen permisos del módulo, ownership y bloquean ciclos', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /workspace_has_module_access\(workspace_id, 'products'\)/i)
  assert.match(sql, /workspace_can_write\(workspace_id, 'products'\)/i)
  assert.match(sql, /p\.workspace_id = workspace_id and p\.user_id = user_id/i)
  assert.match(sql, /prevent_product_bundle_cycle/i)
  assert.match(sql, /bundle_product_id <> component_product_id/i)
})
