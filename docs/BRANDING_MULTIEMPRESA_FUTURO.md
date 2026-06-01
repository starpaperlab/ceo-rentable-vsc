# Branding y Multiempresa Futura

El modelo actual mantiene una sola empresa por usuario en `business_config`.

Para evolucionar a multiempresa sin romper compatibilidad:

1. Crear tabla `companies` con `id`, `user_id`, datos comerciales, branding y preferencias de documentos.
2. Agregar `company_id` nullable a `business_config`, `invoices`, `quotes`, `clients`, `products`, `inventory_items` y documentos futuros.
3. Backfill: crear una empresa por usuario usando su fila actual de `business_config`.
4. Mantener `user_id` como owner principal y usar `company_id` como scope de operación.
5. Actualizar RLS para exigir `companies.user_id = auth.uid()` o admin.
6. Permitir selector de empresa en UI después del backfill.

Mientras tanto, los documentos guardan un snapshot de los datos de empresa para que PDFs históricos no cambien accidentalmente cuando la usuaria actualice su branding.
