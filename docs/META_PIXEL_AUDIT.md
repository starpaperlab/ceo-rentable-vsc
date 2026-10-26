# Meta Pixel: auditoría y medición del recorrido CEO Rentable

Pixel único de la aplicación: **339342380789724**. Repositorio de aplicación identificado: `starpaperlab/ceo-rentable-vsc` (rutas `/diagnostico`, `/checkout`, `/register`, API PayPal y URLs `app.ceorentable.com`). No se modificó `espinal-guerra-ai-os`, ni precios, planes, proveedores, activación de acceso, suscripciones o esquemas SQL. El único cambio al endpoint de verificación es agregar evidencia de tracking a su respuesta una vez terminada la activación existente.

## Hallazgos

- En el código de landing `starpaperlab/CEO-Rentable-OS`, `index.html` inicializa el mismo ID mediante `fbevents.js`, registra PageView inicial y contiene noscript. `src/components/MetaPixel.tsx` omite la primera carga y registra cambios posteriores del router. Los CTA registran InitiateCheckout antes de salir hacia la app. No se cambió ni desplegó esa landing. `LP-CEO-Rentable-OS` no contiene esa instalación en las fuentes revisadas.
- La aplicación ya tenía `metaPixel.js` y un tracker global sobre React Router, por encima de la autenticación. Por tanto, la ausencia de detección en producción no prueba ausencia de código. No se pudo establecer la causa exacta en el dominio vivo: el proxy de este entorno devuelve HTTP 403 para `ceorentable.com`, `app.ceorentable.com` y la URL Vercel de la app, incluso al solicitar la ejecución con acceso ampliado. No confundir ese bloqueo de red con una respuesta de la aplicación.
- Checkout no instrumentaba la entrada directa y el helper excluía el plan anual; su tabla de valores mantenía importes antiguos en DOP, diferentes del contrato de checkout actual. Se eliminaron esos importes del tracking y se reutiliza el contrato de planes sin modificarlo.
- Diagnóstico ya emitía Lead después del insert exitoso. Se conserva esa condición, se evita doble envío de formulario y se agrega ID de evento. No se envían nombre, email ni score financiero en el payload Lead.
- Compra ya estaba ligada a captura PayPal en PaymentSuccess, pero admitía ID de orden como sustituto de captura y precios de catálogo como fallback. Se exige ahora captura completa y monto/moneda confirmados, sin defaults inventados.
- No se encontró transporte activo de Meta Conversions API en `server/`, `api/`, `supabase/functions/` ni el frontend. El helper `buildConversionApiEvent` solo construía un objeto: no constituía una integración operativa. Los IDs de eventos Stripe/PayPal encontrados pertenecen a los proveedores, no a Meta CAPI. Integraciones externas al repositorio siguen sin auditarse en Events Manager.

## Implementación

- Una sola carga de SDK y un solo init del ID esperado. Se reutiliza el SDK existente si está cargado/registrado y se usa `trackSingle` para no emitir a otros píxeles.
- PageView se emite desde el router, sin PageView recursivo al inicializar. Se deduplican ejecuciones consecutivas de la misma ruta/query; cada navegación real del registro y sus redirecciones sí puede generar una visita. Cambios de hash solos no cuentan como otra página.
- InitiateCheckout pertenece a la entrada en `/checkout`, con el plan válido seleccionado y valor inicial cero para la prueba gratuita. Los CTA internos de la app ya no emiten el mismo inicio antes de navegar. Los CTA de landing existentes pueden seguir registrando su propia intención de checkout: revisar en Meta ese solapamiento entre dominios antes de considerar cada evento como un checkout único.
- CompleteRegistration se vincula al resultado exitoso de registro en Checkout/Login, nunca al simple montaje de `/register`. Un registro pendiente de confirmar email no implica prueba ni compra.
- StartTrial se emite solo si el endpoint existente terminó la activación y PayPal informa `ACTIVE`, prueba vigente en `billing_info.cycle_executions`, sin ciclos regulares completados ni último pago positivo. `APPROVED`, una fecha futura de facturación, `has_access` o parámetros de URL por sí solos no prueban prueba gratuita. Si PayPal no devuelve evidencia suficiente, no se inventa el evento.
- Purchase en el navegador requiere respuesta de captura del servidor: `success=true`, `status=completed`, captureId, importe positivo y moneda ISO. No se emite por abrir PaymentSuccess, aprobar una suscripción gratuita, cobrar cero, cancelar o tener acceso al producto.
- Los eventos llevan `eventID` en las opciones Meta, no un campo ordinario dentro del payload. Purchase usa `Purchase:paypal:<captureId>`; StartTrial usa `StartTrial:paypal:<subscriptionId>`; diagnóstico genera ID propio tras guardado. Las conversiones se deduplican en memoria y, si el navegador lo permite, en almacenamiento local (hasta 250 IDs recientes). No es una garantía de exactamente una vez entre dispositivos o frente a borrado de almacenamiento.
- El generador CAPI exige consentimiento e ID explícito; puede reutilizar el mismo ID del navegador. No se instaló otro envío CAPI ni se usó el token de Marketing Hub de otro proyecto. Si ya existe un emisor externo, debe recibir exactamente el mismo event_name/event_id de cada hecho; la deduplicación real entre canales sigue pendiente de comprobarse en Meta.

## Consentimiento

Se agregó una preferencia específica para medición publicitaria, independiente de los términos del servicio y del checkbox de novedades por email. Antes de permitirla no se carga el SDK ni se encolan eventos. Permitir y rechazar tienen controles equivalentes. Preferencias de cookies permite retirar la autorización; se llama `consent/revoke`, se dejan de emitir eventos y se eliminan `_fbp`/`_fbc` accesibles desde la app. No se eliminan cookies de autenticación. No se reproducen conversiones ocurridas antes de consentir.

La elección se conserva por origen; no se presume consentimiento de la landing ni se comparten preferencias de forma automática entre dominios. La política de cookies de la app ahora describe el control instalado. La landing conserva su implementación previa; su consentimiento efectivo en producción necesita revisión independiente. Meta Pixel Helper puede no detectar el píxel hasta permitir la medición, y bloqueadores de anuncios pueden impedir la carga aun con consentimiento.

## Pruebas ejecutables

```sh
npm ci
npm run lint
npm run typecheck
npm run build
node --test tests/*.test.js tests/security/*.test.js
npx playwright install chromium
npm run test:tracking
# O usar CHROMIUM_PATH=/usr/bin/chromium si Chromium ya está instalado.
```

La prueba de Chromium monta las páginas reales de la aplicación con proveedores aislados. Comprueba consentimiento, rechazo/revocación, carga e init únicos, PageView SPA, checkout directo, recorrido de registro sin conversión al abrirlo, ocho respuestas del diagnóstico, fallo de persistencia sin Lead y éxito con un único Lead. Comprueba que una URL de retorno no produce Purchase, guardas de recibos, eventID y deduplicación entre recargas. Las respuestas de Supabase, el SDK Meta y los recibos son fixtures explícitos: no se envían eventos reales a Meta, no se registran cuentas, no se hacen compras ni se activa una suscripción real. Las pruebas del servidor verifican distintos estados/ciclos PayPal sin llamar al proveedor.

Había un error de lint previo (importación sin uso de calculateServiceCost en Products); se quitó únicamente esa importación, sin cambiar cálculos. El build conserva avisos preexistentes de claves duplicadas en LineItemsTable y tamaño de bundles; no pertenecen a esta corrección de tracking.

## Comprobación manual real pendiente

1. Abrir Meta Events Manager → origen de datos del píxel **339342380789724** → Test events, y abrir `https://app.ceorentable.com/checkout?plan=monthly` en un navegador sin bloqueadores para esta prueba.
2. Antes de permitir medición: no debe haber petición a `connect.facebook.net/.../fbevents.js` ni eventos del píxel. Permitir medición: debe haber un SDK, un init del ID indicado, PageView e InitiateCheckout. Comprobar también plan anual, `/diagnostico` y flujo de registro/navegación. Pixel Helper y Network verifican el navegador; Events Manager verifica la recepción de Meta.
3. Completar un diagnóstico identificado como prueba: Lead solo después de respuesta exitosa de persistencia. No se generaron registros reales desde este entorno. Evitar contaminar prospectos comerciales al hacer esta validación.
4. StartTrial: utilizar únicamente un entorno/cuenta de prueba PayPal autorizado; comprobar el resultado del endpoint y los ciclos de prueba. Si no existe sandbox preparado, dejarlo pendiente; no activar una suscripción real solo para probar tracking.
5. Purchase: usar captura sandbox confirmada, no una compra real. Comprobar ID/importe/moneda, ausencia ante pago pendiente/cancelado, recarga sin duplicado y eventID en Test events. No hay que modificar precios ni proveedor.
6. Revisar Diagnostics y eventos Browser/Server. Si aparece Server, identificar el emisor CAPI externo antes de añadir otro y confirmar deduplicación por nombre e ID. Configurar test_event_code solamente en ese emisor autorizado, no publicar tokens.

## Límites de cobertura

Un píxel de navegador no puede registrar un cargo recurrente sucedido diez días después sin que la persona esté en la app. Los webhooks existentes de PayPal/Stripe pueden confirmar pagos, pero no se les añadió un envío publicitario nuevo sin un contrato de consentimiento de servidor y credenciales CAPI autorizadas. **Purchase de renovaciones/cobros fuera del navegador sigue pendiente**. El código no presenta la aprobación o activación de la prueba como una venta.

Verificación de recepción en Meta Events Manager, carga del SDK real en los dominios públicos, atribución entre landing/app y deduplicación con cualquier CAPI externa: pendientes por falta de acceso/red. Un build correcto o una prueba con SDK aislado no confirman esos puntos.
