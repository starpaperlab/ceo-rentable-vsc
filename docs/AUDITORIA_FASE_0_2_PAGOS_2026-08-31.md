# Auditoría Fase 0.2 — Pagos, suscripciones y activación de acceso

Fecha: 2026-08-31
Rama: `audit-fase-0-2-pagos`
Base auditada: `main` @ `4176c9e060ce3cf898d231ad9614b9fcde9fbb39`

## Objetivo

Cerrar la arquitectura de cobros de CEO Rentable OS para que un pago confirmado active acceso de forma segura, idempotente y auditable, y para que el estado de acceso/subscripción se mantenga consistente ante reintentos, cancelaciones y fallas.

## Estado real encontrado

### PayPal

Existe flujo backend completo para:
- crear orden;
- persistir `paypal_orders`;
- recuperar y capturar orden;
- validar `COMPLETED`;
- validar plan, monto y moneda contra la orden local;
- registrar transacción;
- activar `users.has_access`;
- actualizar plan, fuente de acceso y proveedor;
- hacer `upsert` en `subscriptions`;
- marcar la orden PayPal como completada.

El handler además comprueba que la orden local pertenece al usuario autenticado antes de capturarla.

### Stripe

Permanece código histórico/legacy de Stripe (`api/stripe/create-session.js`, handler de checkout y edge function de webhook). La documentación técnica actual identifica PayPal como pasarela primaria y Stripe como legacy/deshabilitado por defecto. Antes de reactivar Stripe debe definirse una única arquitectura de pagos y evitar dos fuentes de verdad concurrentes.

### Acceso

El sistema ya tiene control de acceso por plan y estado, junto con `subscriptions`, `transactions`, `users.has_access`, `payment_provider`, `access_source` e `is_lifetime`.

### Seguridad

La Fase 0.1 endureció autenticación en email e invitaciones. Se encontró un patrón pendiente en `server/paypalHandler.js`: cuando Supabase rechaza un JWT, `authenticate()` concatena `error.message` a la respuesta pública. Esto puede exponer detalles internos de autenticación y debe alinearse con el contrato seguro ya aplicado al handler de email.

## Riesgos prioritarios

### P0 — Sanitizar errores de autenticación PayPal

`authenticate()` devuelve actualmente detalles de `auth.getUser()` al cliente. Debe responder únicamente con un mensaje público allowlisted para tokens inválidos/expirados y capturar excepciones del proveedor de auth.

Criterios de aceptación:
- JWT faltante -> 401 controlado;
- JWT inválido/malformado/expirado -> 401 controlado;
- excepción de Supabase Auth -> 401 controlado;
- ningún detalle interno de JWT/Supabase aparece en el body público;
- no se llama a PayPal cuando autenticación falla.

### P0 — Certificar idempotencia de captura

El flujo intenta ser idempotente mediante `provider_capture_id` en `transactions` y tratamiento de capturas ya realizadas. Debe verificarse contra las restricciones reales de BD y con pruebas de doble submit/reintento.

### P0 — Consistencia de estado de acceso

La activación actual actualiza `users`, `subscriptions`, `transactions` y `paypal_orders` en pasos separados. Si uno de los pasos falla después de otro, puede quedar estado parcialmente aplicado. Debe evaluarse una función/RPC transaccional o mecanismo equivalente de reconciliación.

### P0 — Plan mensual no equivale todavía a suscripción recurrente certificada

El plan `monthly` se procesa con una orden de captura única. Debe definirse si el modelo final será renovación recurrente real, renovación manual o migración a Stripe Billing. No se debe vender como suscripción automática hasta certificar el mecanismo recurrente.

### P1 — Webhook y reconciliación

Existe webhook PayPal. Debe certificarse:
- firma/verificación del webhook;
- eventos admitidos;
- idempotencia;
- recuperación cuando el cliente paga pero cierra la pestaña antes de volver a `payment-success`;
- reconciliación de pagos completados cuyo frontend no terminó activación.

### P1 — Fuente única de verdad

Definir autoridad entre `users`, `subscriptions`, `transactions` y `paypal_orders` para evitar divergencias. Recomendación: `transactions` como ledger inmutable de cobros, `subscriptions` como estado contractual y `users` como cache/estado efectivo de acceso derivado.

### P1 — Stripe legacy

Mantener deshabilitado hasta decidir reactivación. Antes de usar Stripe:
- checkout profesional;
- webhook firmado;
- customer/subscription IDs;
- estados `active`, `past_due`, `canceled`, etc.;
- portal o actualización de método de pago;
- recuperación ante pago fallido;
- pruebas sandbox E2E.

## Orden de ejecución aprobado

1. Sanitizar autenticación del flujo PayPal y añadir pruebas de regresión.
2. Auditar migraciones/constraints de `paypal_orders`, `transactions`, `subscriptions` y `users`.
3. Certificar idempotencia de create/capture/webhook.
4. Diseñar activación transaccional/reconciliable.
5. Certificar webhook PayPal.
6. Definir estrategia definitiva de mensualidad/recurrente.
7. Decidir PayPal-only temporal vs Stripe Billing como pasarela principal.
8. Implementar checkout final y estados de suscripción.
9. Ejecutar pruebas E2E en staging.
10. Promover a producción solo después de pasar checklist de seguridad y pagos.

## Regla de despliegue

No modificar `main` directamente para esta fase. Todo cambio sale de `audit-fase-0-2-pagos`, pasa por diff/PR y validación antes de merge.
