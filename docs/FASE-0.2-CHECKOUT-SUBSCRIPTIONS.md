# Fase 0.2 — Checkout y suscripciones

## Contrato comercial aprobado

- Plan Mensual: USD 17.99 cada mes.
- Plan Anual: USD 179.00 cada año.
- Ahorro anual frente a 12 mensualidades: USD 36.88.
- Ambos planes incluyen 21 días de prueba gratis.
- El cliente registra el método de pago al iniciar la prueba.
- Al terminar el trial, PayPal cobra automáticamente salvo cancelación previa.
- Founder Lifetime permanece como plan legacy/admin-only y no forma parte de la oferta pública.

## Checkout objetivo

Ruta pública objetivo:
- `/checkout?plan=monthly`
- `/checkout?plan=annual`

Desktop: dos columnas.

Columna de registro:
- Nombre
- Apellido
- Correo
- Contraseña + confirmación
- Empresa/marca
- Teléfono/WhatsApp
- País
- Tipo de negocio (opcional)
- Términos y privacidad obligatorios
- Marketing opcional, nunca premarcado

Columna de compra:
- Plan
- 21 días gratis
- Precio posterior al trial
- Renovación automática
- Ahorro anual cuando aplique
- PayPal
- Mensaje explícito: hoy USD 0; primer cobro al finalizar el trial

Mobile: registro primero y resumen/pago después.

## Estados de acceso

`pending_checkout` -> `trialing` -> `active`

Estados adicionales que deben manejarse sin conceder acceso incorrecto:
- cancelled
- suspended
- past_due / payment_failed
- expired

La llegada a una página de éxito nunca es autoridad suficiente para activar acceso. La autoridad debe provenir de una suscripción validada con PayPal y/o webhook verificado.

## Seguridad

- No almacenar secretos PayPal en frontend.
- Los IDs de billing plans pueden ser públicos y configurarse por entorno.
- Sandbox y Live deben tener IDs separados.
- Preview/Staging no debe ejecutar cobros Live.
- El endpoint temporal de bootstrap de planes Sandbox fue retirado después de completar las pruebas.

## Estado final de Fase 0.2

1. Billing Plans de PayPal configurados con ciclo TRIAL de 21 días + ciclo REGULAR mensual/anual.
2. PayPal JS SDK integrado en modo subscription (`vault=true`, `intent=subscription`).
3. Provider subscription ID y estado de ciclo persistidos de forma resiliente.
4. Suscripción validada server-side antes de activar acceso.
5. Checkout responsive público limitado a Mensual y Anual.
6. Founder Lifetime conservado como plan interno/legacy, fuera de la oferta pública.
7. Oferta comercial unificada en USD 17.99/mes, USD 179/año y 21 días de prueba.
