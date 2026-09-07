# Fase 0.2 — Checkout y suscripciones

## Contrato comercial aprobado

- Plan Mensual: USD 21.00 cada mes.
- Plan Anual: USD 210.00 cada año.
- Ahorro anual frente a 12 mensualidades: USD 42.00 (2 meses gratis).
- Ambos planes incluyen 7 días de prueba gratis.
- El cliente registra el método de pago al iniciar la prueba.
- Al terminar el trial, PayPal cobra automáticamente salvo cancelación previa.
- Founder Lifetime permanece como flujo de pago único y no se convierte a USD sin decisión comercial separada.

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
- 7 días gratis
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
- No habilitar producción hasta completar E2E Sandbox.

## Próxima implementación

1. Crear/asegurar Product y Billing Plans de PayPal Sandbox con ciclo TRIAL de 7 días + ciclo REGULAR mensual/anual.
2. Integrar PayPal JS SDK en modo subscription (`vault=true`, `intent=subscription`).
3. Persistir provider subscription ID y estado de ciclo.
4. Validar suscripción server-side antes de activar trial.
5. Extender webhook para eventos de suscripción verificados.
6. Actualizar migraciones y pruebas de idempotencia.
7. Construir checkout visual responsive y probar en Vercel Preview.
