# Auditoría Multiusuario - CEO Rentable OS
Fecha: 2026-04-17

## Hallazgo crítico (causa raíz de branding compartido)
- En `src/lib/supabaseOwnership.js`, `fetchOwnedRows` tenía un fallback final inseguro:
  - Si fallaban filtros por `user_id`/`created_by`, terminaba ejecutando `select *` sin scope de dueña.
  - Esto podía mostrar `business_config` (logo/color/fuente) de otra usuaria.

## Riesgos encontrados
1. Lectura cross-tenant por fallback global sin ownership (crítico).
2. Mutaciones (`update/delete`) por `id` sin filtro adicional de ownership en varios módulos (alto), dependiendo de RLS para bloquear.
3. Posibles duplicados en `business_config` por usuaria (medio), que pueden producir branding inconsistente.

## Correcciones aplicadas en frontend
- Se eliminó fallback de lectura no acotada en `fetchOwnedRows`.
- Se agregaron helpers centrales de mutación segura:
  - `updateOwnedRowById(...)`
  - `deleteOwnedRowById(...)`
- Se aplicaron en módulos críticos:
  - Branding/configuración: `AppSettings`
  - Productos: `Products`
  - Clientes: `Clients`
  - Facturación/Cotizaciones: `Billing`, `DocumentForm`, `OverdueDashboard`, `Reports`
  - Inventario: `Inventory`
  - Agenda/Calendario: `Agenda`
  - Control mensual: `MonthlyControl`
  - Auditoría de precios: `Profitability`

## Correcciones SQL listas para ejecutar
- Archivo: `supabase/sql/MULTIUSUARIO_AISLAMIENTO_HOTFIX.sql`
- Incluye:
  - normalización y backfill de `user_id`/`created_by` en tablas críticas,
  - RLS estricto por `user_id` + bypass admin controlado,
  - deduplicación de `business_config` (conserva la más reciente),
  - índice único por usuaria en `business_config`.

## Resultado esperado
- Cada usuaria solo ve/edita sus datos en:
  - branding,
  - productos,
  - cotizaciones/facturas,
  - agenda,
  - inventario,
  - control mensual,
  - reportes,
  - auditoría de precios.

## Pruebas recomendadas (admin + 2 usuarias)
1. Usuaria A cambia logo/color en Configuración.
   - Usuaria B no debe ver cambios.
2. Usuaria A crea producto/cliente/cotización/factura/cita/movimiento inventario.
   - Usuaria B no debe ver ningún registro.
3. Usuaria B edita un `id` propio y luego intenta (desde DevTools) forzar `id` de A.
   - Debe fallar con no autorizado / 0 filas afectadas.
4. Admin debe poder ver/gestionar según políticas de admin.

## Nota
- Esta auditoría no ejecuta SQL remoto automáticamente; debes correr el script en Supabase SQL Editor para cerrar el aislamiento a nivel base de datos.
