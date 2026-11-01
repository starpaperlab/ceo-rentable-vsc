# Whop: checkout y activación verificada

Implementación basada en el PR #4 (`0b5d2f2`); se conserva el checkout, formulario, marca y selector. Se sustituye únicamente el salto directo a enlaces sin asociación. PayPal histórico permanece.

## Contrato oficial utilizado

SDK oficial `@whop/sdk` **2.7.0**, API fechada **2026-10-28**:
https://github.com/whopio/whopsdk-typescript y https://docs.whop.com/api-reference.
Se consultaron README, reference.md y tipos distribuidos en el paquete npm oficial. En esta versión los planes se consultan mediante `variants.retrieve({id})`; checkout usa `variant_id`, `metadata`, `redirect_url` y responde `purchase_url`. No se envían nombres de campos de versiones antiguas.

Mensual `plan_erGFyQYebyWFZ`: USD 17.99, período 30 días. Anual `plan_rx46nFwgZymzX`: USD 179, período 365 días. Ambos requieren 10 días de prueba y precio inicial cero. Se comprueba la configuración en Whop antes de crear un checkout. No se crea ni se publica Founder.

## Flujo

1. Se valida el formulario y el consentimiento legal (marketing opcional). El registro usa Supabase Auth existente. Si requiere confirmar correo, no se crea pago; la confirmación vuelve al checkout con el plan. Un correo duplicado requiere iniciar sesión. Usuarios existentes no vuelven a proporcionar contraseña y pueden editar empresa/WhatsApp/país.
2. `POST /api/whop/create-checkout` valida el bearer con Supabase Auth, correo confirmado y perfil real. Requiere `WHOP_CHECKOUT_ENABLED=true`, migración, webhook registrado y planes correctos. Cuentas con acceso vigente no inician otra suscripción. El servidor crea un UUID privado en `whop_checkout_intents`, ligado al usuario, plan y cuenta vendedora. Whop recibe únicamente ese identificador en metadata.
3. Se abre el checkout alojado oficial devuelto por Whop; el registro, planes y resumen siguen en la página existente. Nunca se usa un enlace público sin asociación como fallback. Volver atrás/cerrar Whop conserva la cuenta; `/payment-cancel?plan=annual|monthly` permite reintentar. La API vigente no ofrece `cancel_url` en checkout configurations y no se inventa ese campo.
4. `POST /api/whop/webhook` verifica los bytes originales con `unwrapWebhook` oficial (Standard Webhooks; tolerancia temporal y rotación de firmas). Body parser deshabilitado, máximo 1 MiB, errores sin secretos.
5. Eventos vigentes: `membership.activated`, `membership.updated`, `membership.deactivated`, `payment.succeeded`, `payment.failed`, `refund.created`, `refund.updated`. Trial es `membership.status=trialing`, no un evento inventado. Renovación/pago/reembolso recuperan la membresía actual mediante la API; la membresía es la autoridad de acceso, incluso ante un reembolso parcial que no revoca el servicio. No se infiere activación de un pago aislado ni de un email coincidente.
6. `apply_whop_membership` valida la asociación, serializa por usuario y actualiza membresía, suscripción, usuario y recibo de evento en una transacción. Duplicados son inocuos, estados antiguos no pisan estados nuevos y cancelar una membresía vieja no revoca otra vigente. Un fallo revierte todo y el endpoint devuelve 503 para reintento. Datos sin asociación son ignorados; un intento conocido pero no persistible devuelve error para reintento. No se reasigna una membresía a otro usuario.
7. `/payment-success?provider=whop` consulta `GET /api/whop/status` con la sesión. Realiza hasta 12 consultas a intervalos de 2.5 s y ofrece reintento manual. Sólo muestra prueba activa cuando la base lo confirma. No confía en `trial_days`, IDs ni otros parámetros de retorno.

`past_due` se normaliza a `payment_failed` y conserva sólo el período futuro ya vigente (misma regla temporal que el proveedor histórico). Cancelación programada conserva ese período; cancelación completada/expiración revocan. El guard del dashboard exige además `whop_access_until` futuro. La prueba conserva sus fechas originales tras renovaciones; no se reinicia por visitar el checkout.

## Migración

`supabase/migrations/202611010001_whop_checkout_activation.sql` debe revisarse y aplicarse **únicamente a la base CEO existente**, después del esquema/hardening actuales. Se verificó dos veces sobre PostgreSQL embebido PGlite, incluida repetibilidad, rollback y permisos. **No está aplicada a producción desde esta sesión.**

Añade tablas privadas `whop_checkout_intents`, `whop_memberships`, `whop_webhook_events`; fechas en `subscriptions` y `users.whop_access_until`. Extiende restricciones conservando valores anteriores. Las tablas nuevas y RPC son accesibles sólo a `service_role`; los triggers impiden al navegador escribir suscripciones Whop o modificar su fecha de acceso. Se preservan accesos manuales/PayPal independientes. No elimina datos ni modifica las integraciones anteriores.

## Configuración y publicación pendiente

Se requiere acceso administrativo a la infraestructura existente. No se han confirmado desde esta sesión credenciales administrativas, migración remota, webhook remoto ni despliegue. `WHOP_API_KEY` ya está en Vercel según la confirmación del propietario; no se solicita su valor.

En Vercel **ceo-rentable-vsc**, usar sus bindings Supabase existentes (`SUPABASE_URL` o `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). La clave service role es sólo del servidor. Añadir:

- `WHOP_WEBHOOK_ID`: identificador del endpoint.
- `WHOP_WEBHOOK_SECRET`: secreto de firma literal entregado por Whop, sólo servidor; no es la API key.
- `WHOP_CHECKOUT_ENABLED=false` durante preparación; habilitar únicamente después de verificar conexión y activación con Whop.

Registro asistido, si se inyectan de forma segura `WHOP_API_KEY`, `VERCEL_TOKEN` y opcionalmente `VERCEL_TEAM_ID` en una máquina administrativa:

```sh
node scripts/configure-whop-webhook.mjs --apply
```

El script comprueba el proyecto existente, evita duplicar endpoints, crea el endpoint DESHABILITADO para `https://app.ceorentable.com/api/whop/webhook`, fija la versión API y envía secreto/ID directamente a variables cifradas de producción Vercel. No imprime ni guarda secretos en archivos. Si el endpoint ya existe, recuperar su secreto desde el dashboard y configurarlo allí; la API sólo lo devuelve al crearlo. Si falla el guardado tras creación, el endpoint queda deshabilitado y se informa sin mostrar el secreto. **El script no se ejecutó con `--apply` en esta sesión.**

Orden operativo:

1. Aplicar la migración en Supabase CEO y preparar variables con checkout deshabilitado.
2. Desplegar la rama validada en el proyecto existente manteniendo deshabilitado el inicio de pagos; habilitar el webhook con los eventos y versión indicados.
3. Ejecutar `npm run whop:preflight` con bindings administrativos seguros. Comprueba migración, ambos planes, webhook registrado y rechazo de una entrega sin firma. No cobra ni crea membresías.
4. Verificar una entrega firmada originada por Whop y la activación de una cuenta de prueba vinculada, sin cargos reales. Las fixtures locales no sustituyen esta comprobación. Si el entorno sandbox usa otros IDs/dominio, no alterar los IDs comerciales de producción para simular evidencia. Coordinar la prueba oficial desde el dashboard.
5. Sólo después, habilitar `WHOP_CHECKOUT_ENABLED=true`, fusionar el PR validado a main, desplegar y comprobar `https://app.ceorentable.com/checkout?plan=monthly` y `?plan=annual`. Evitar un push a main antes de completar estos pasos, pues el repositorio usa despliegue automático.

La política de red necesita los dominios de los servicios. Se guardaron adiciones para docs.whop.com, api.whop.com, api.vercel.com, vercel.com, api.github.com y app.ceorentable.com en el borrador del entorno, sin reemplazar los presets. Guardar el borrador no demuestra su aplicación al runtime. Añadir el hostname Supabase real cuando se habilite su conexión; no se adivina.

## Validación local

```sh
npm ci
npm run test:whop
node --test tests/*.test.js tests/security/*.test.js
CHROMIUM_PATH=/usr/bin/chromium npm run test:tracking
npm run lint
npm run typecheck
npm run build
```

Las pruebas Whop ejercitan contratos servidor, firmas auténticas HMAC de fixtures, usuario confirmado, rechazo por configuración incompleta, mensual/anual, períodos de prueba, idempotencia, eventos atrasados, rollback, múltiples membresías, privilegios SQL y estado consultado de manera autenticada. Chromium recorre las páginas reales con transporte aislado: registro, correo existente, sesión, edición comercial, confirmación de correo, marketing opcional, retorno falsificado, estado pendiente/confirmado, cancelación, guard del dashboard y ancho móvil. No crea cuentas remotas ni pagos reales.

Los warnings de propiedades duplicadas en LineItemsTable y chunks grandes ya existían y no se alteran en esta integración.
