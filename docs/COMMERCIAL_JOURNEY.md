# CEO Rentable → Espinal Guerra AI OS: recorrido comercial

## Estado y límites de acceso

La usuaria confirmó que Meta Ads fue vinculada/sincronizada sin campañas y que el Pixel 339342380789724 registra actividad. Esta fase no cambia cuentas, píxeles, portafolios, tokens Meta ni instala CAPI. No modifica precios, planes, proveedores ni concede acceso desde datos publicitarios.

Repositorios utilizados: `ceo-rentable-vsc` (app/pagos/email) y `espinal-guerra-ai-os` (CRM/Marketing). La landing auditada en fuentes es `starpaperlab/CEO-Rentable-OS`: HomeV2/SeoLanding y su configuración usan ceorentable.com y enlazan a la app. No se modificó la landing porque no se pudo confirmar la versión/domino vivo desde esta red. El proxy bloquea las peticiones públicas a CEO con 403; no significa que el sitio esté caído. La primera campaña debe llevar directamente a `/diagnostico` con UTMs, sin necesitar una reconstrucción de landing.

No hay claves SQL/Resend inyectadas ni sesiones de producción en esta máquina. Las migraciones se entregan para aplicación manual en los dos proyectos existentes. La verificación real sigue pendiente hasta esa configuración y prueba controlada. El despliegue conserva el flujo anterior si la bandera pública sigue deshabilitada.

## Qué se implementó

- Misma fórmula del CEO Score (pesos 5/12/20/25 + tres respuestas de 25). El servidor valida las ocho respuestas y genera un resultado cualitativo reproducible, sin cifras de ganancias o ingresos inventadas. El resultado y las respuestas se guardan juntos. El CEO Score no se transforma en HOT/WARM/COLD: preparación financiera no es intención de compra.
- POST `/api/diagnostic`: solicitud expresa del correo, opt-in promocional independiente, captura UUID estable, honeypot y límites transaccionales (10 por huella IP/hora, 3 por email/día, 100 global/hora). La huella IP es HMAC, no una dirección registrada en claro. Estos controles iniciales no sustituyen un servicio antiabuso si el volumen requiere uno.
- Guardado atómico de lead, diagnóstico y cola. Reintento de la misma captura no genera otra fila. El navegador no recibe service-role ni el secreto del CRM y no puede insertar las columnas privadas nuevas.
- Entrega nativa por HMAC al receptor ya existente `/api/integrations/capture/ceo-rentable-diagnostico`. La marca/organización se resuelven en las fuentes autorizadas de AI OS; no hay UUID fijo en el frontend. El mismo email normalizado reutiliza contacto solo dentro de organización, marca y procedencia de pruebas. Cada diagnóstico mantiene su propia captura.
- Entregas con leases, payload persistido antes de HTTP y reintentos acotados. No se mezclan organización/marca desde parámetros libres del cliente. Logs con códigos seguros, sin payloads ni credenciales.
- Correo solicitado vía `sendEmailWithResend` existente, ahora con Idempotency-Key opcional. Se guarda el ID aceptado por Resend. Aceptado no significa entregado/leído. Los tests preparan el contenido y suprimen envío, salvo un destinatario propio autorizado configurado explícitamente en DIAGNOSTIC_TEST_EMAIL_TO; esos correos siguen marcados is_test y llevan [PRUEBA] en el asunto. Para evitar duplicados después de la ventana del proveedor, un trabajo de email de más de 23 horas requiere revisión; no se reenvía automáticamente fuera de esa ventana.
- Enlace con cuenta confirmada: POST `/api/commercial-link` valida JWT, email verificado y coincidencia con el diagnóstico. Se conservan hechos de proveedor aún no vinculados y se asocian solo si la captura es anterior al evento. No se atribuyen pagos anteriores a un diagnóstico posterior.
- `trial.started`: únicamente después de la activación existente y evidencia real de ciclos de prueba PayPal; fecha de fin del proveedor. La respuesta de aprobación o visita a checkout no prueba una venta.
- `subscription.paid`: capturas completadas del endpoint y webhook existentes, más `PAYMENT.SALE.COMPLETED` de suscripciones con firma válida y suscripción local conocida. Se conserva importe/moneda/ID real; la misma captura no se cuenta dos veces. Cancelación/expiración confirmadas detienen los pasos preparados. No se agregó un emisor Meta/CAPI.
- Hechos propios de navegación/checkout después de una captura y con permiso publicitario, clasificados como observación del navegador; no son prueba de pago. No se cuentan visitas anónimas anteriores a la captura como si estuvieran vinculadas a una persona.
- UTMs conservadas durante diagnóstico/registro/checkout y en el email; click IDs solo con permiso. El enlace de email incluye referencia de diagnóstico, nunca email o un secreto privado. La cuenta debe verificar el mismo correo para vincularse.
- Informe en CRM y Marketing: prospectos, diagnósticos, correos aceptados, pruebas, clientas con pago e ingresos separados por moneda. Excluye tests. Agrupa por UTMs documentadas y no presenta esos grupos como atribución verificada de Meta. No reconstruye automáticamente ingresos históricos ni hechos sin vínculo válido.

## Acompañamiento: preparado, sin envío promocional activo

Se guardan cinco pasos por prueba: 0 bienvenida, 2 costos, 4 precios, 7 herramientas, 9 fin de prueba. Los textos versionados están en `server/trialSequenceTemplates.js`. Los pasos permanecen `prepared`; no existe un consumidor que los envíe. Los promocionales sin opt-in se cancelan desde su creación; pagos, cancelaciones y bajas cancelan el acompañamiento. El futuro envío deberá comprobar de nuevo consentimiento, baja, fin real y pago antes de cada mensaje.

`/api/commercial-unsubscribe` muestra confirmación por GET y registra la baja por POST con un token aleatorio. No cambia la suscripción ni mensajes imprescindibles de la cuenta. No se envían campañas masivas ni correos de conversión en esta fase. El diagnóstico solicitado sí puede incluir la invitación descrita antes de enviar el formulario.

## Si aparece «public.leads does not exist»

La migración CEO 202610260001 es exclusiva del proyecto Supabase de **app.ceorentable.com**. No ejecutarla en AI OS ni crear leads allí para hacerla pasar. Ejecutar primero `docs/sql/commercial-project-preflight.sql` en ambos proyectos y anotar el nombre visible en el panel. El SQL de auditoría solo inspecciona catálogo/columnas y no falla por tablas ausentes.

Si `ceo.leads=false`, confirmar el proyecto asociado a las variables de Supabase de la aplicación. Si es el proyecto correcto y falta leads, revisar su historial/esquema antes de aplicar una migración fundacional: la app tiene captación existente y no debe crearse una base paralela por suposición. La migración ahora se detiene con CEO_PRECHECK antes de escribir.

En AI OS, el error de crm_capture_sources corresponde a la dependencia 006. Usar la guía del otro repositorio; no aplicar el esquema CEO como solución. Mantener las banderas de la conexión nueva deshabilitadas durante esta comprobación.

## Activación manual exacta (una vez desplegado)

Las versiones finales de ambas migraciones se pueden reaplicar sin perder datos; si se ejecutó una copia intermedia, usar los archivos finales del commit de entrega.

1. **Supabase CEO existente**: aplicar completo `supabase/migrations/202610260001_commercial_journey.sql`. Extiende leads y agrega cola/hechos/pasos; no importa registros anteriores.
2. **Supabase AI OS existente**: aplicar `supabase/migrations/202610260008_commercial_journey.sql`. Requiere 005/006 ya aplicadas; no crea organizaciones o marcas. La 007 de Meta Ads se conserva.
3. En AI OS → Configuración, comprobar organización existente y fuente `ceo-rentable-diagnostico`, proveedor `signed_backend`, marca CEO Rentable OS real. Habilitarla. Si falta la vinculación inicial 006, ejecutar primero la auditoría/bootstrap existente; no crear otra empresa para resolverlo.
4. En **Vercel → AI OS → Settings → Environment Variables → Production**, comprobar `SUPABASE_SERVICE_ROLE_KEY` del proyecto AI OS y `CRM_WEBHOOK_SECRET` (mínimo 32 caracteres). Son obligatorias para recepción externa; no usar la clave de CEO como service-role de AI OS.
5. En **Vercel → CEO app → Production**, conservar su Supabase/service-role y Resend/remitente verificado existentes. Configurar `AI_OS_CRM_WEBHOOK_SECRET` con el mismo valor privado del punto anterior. No copiar secretos al chat ni a Git. `AI_OS_CRM_BASE_URL` y `AI_OS_CRM_SOURCE_KEY` son opcionales y ya tienen los valores correctos predeterminados; no hace falta Brand ID ni otra organización.
6. Primero habilitar `COMMERCIAL_JOURNEY_ENABLED=true`, `COMMERCIAL_DELIVERY_ENABLED=true` y `VITE_COMMERCIAL_JOURNEY_ENABLED=true`. Mantener `DIAGNOSTIC_EMAIL_ENABLED=false` durante la prueba de captura. Configurar/conservar `CRON_SECRET` en CEO. El cron existente `/api/booking-reminders` invoca también el worker comercial solo cuando se autentica con ese secreto. No usa el fallback por header para autorizar el worker. También existe `/api/commercial-worker`, GET con el mismo Bearer privado, para operación autorizada. No se creó otro cron ni proyecto.
7. Redeploy de ambas aplicaciones si cambian variables. Para prueba sin datos comerciales, enviar `is_test:true` desde una ejecución técnica controlada de `/api/diagnostic`: no basta agregar un parámetro URL. En Preview la marca de prueba se fuerza también en servidor. Los correos de prueba se preparan/suprimen por defecto, incluso si se habilita correo. La excepción controlada del punto 9 no los convierte en prospectos reales.
8. Confirmar en las bases existentes: lead/respuestas/resultado, entregas, fila de crm_contacts/crm_leads de CEO, UTMs e is_test. Repetir la misma captura y verificar una sola fila. El informe real debe seguir excluyendo esa prueba.
9. Para probar el email real, mantener `is_test:true`, configurar exactamente el destinatario propio autorizado en `DIAGNOSTIC_TEST_EMAIL_TO` y habilitar `DIAGNOSTIC_EMAIL_ENABLED=true`, con remitente Resend verificado. El worker solo permite ese email de prueba y conserva is_test en CRM/métricas; el asunto lleva [PRUEBA]. Revisar ID aceptado y bandeja. No cambiar is_test a false para probar. Después retirar la excepción si ya no es necesaria. Este envío real no fue ejecutado desde la máquina. No cambiar IDs de trabajo para forzar reenvíos ambiguos.
10. Validar trial/pago en sandbox existente, nunca con pagos reales. PayPal debe notificar `PAYMENT.SALE.COMPLETED` al webhook existente para los cobros de suscripciones; si no está suscrito a ese evento, la captura comercial no puede adivinar cobros. No crear otro webhook ni cambiar el proveedor. Revisar `ceo_commercial_user_facts` si falta vínculo de cuenta; no atribuir por nombre.

No añadir ni regenerar META_ACCESS_TOKEN. El seguimiento de Stripe heredado no se reconstruyó: si sigue en uso para cobros reales, sus hechos verificados necesitan un adaptador equivalente antes de declararlos incluidos en el informe. No se infieren ingresos desde tablas que el navegador pueda escribir.

## Verificación y seguridad

`npm run lint`, `npm run typecheck`, `npm run build`, `node --test tests/*.test.js tests/security/*.test.js`, `npm run test:tracking` (Chromium real con proveedores aislados). Se mantienen las comprobaciones de píxel previas.

Desde el checkout de AI OS, con ambos repositorios y dependencias disponibles: `npm run test:commercial-pair` (`CEO_REPO_PATH` opcional). Levanta dos PostgreSQL aislados, ejecuta ambos contratos reales, firma/recibe eventos y simula únicamente el transporte externo Resend. Comprueba diagnóstico, contacto/marca, UTMs, email aceptado, vínculo, prueba, pago, deduplicación e informe. No llama a producción ni hace pagos/envíos reales.

El lanzamiento del anuncio requiere además la prueba manual del punto 8, un correo recibido, una activación sandbox y la recepción de eventos en Meta ya existente. No declarar lista la campaña solo por tener código desplegado.
