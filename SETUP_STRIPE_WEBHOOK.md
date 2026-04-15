# 🔧 CONFIGURACIÓN RÁPIDA — FASE 5

## 1️⃣ Variables de Entorno para Supabase

En tu terminal, dentro del proyecto:

```bash
# Ver las variables actuales
cat .env.local
```

**Necesitas agregar (si no están):**

```env
# ========================================
# STRIPE WEBHOOK (para Edge Function)
# ========================================
VITE_STRIPE_WEBHOOK_SECRET=whsec_xxx...
```

**Obtenerlas:**
1. Ve a [Stripe Dashboard](https://dashboard.stripe.com)
2. **Developers → Webhooks**
3. Busca tu endpoint (o crea uno nuevo)
4. **Signing secret** → Copia el valor

---

## 2️⃣ Crear Secretos en Supabase

Los secretos en Supabase son DIFERENTES a `.env.local`:

### Opción A: Desde Dashboard

1. **[Supabase Dashboard](https://app.supabase.com)**
2. **Tu Proyecto → Settings → Secrets**
3. **New Secret** para cada uno:

```
STRIPE_SECRET_KEY = sk_live_...
STRIPE_WEBHOOK_SECRET = whsec_...
SUPABASE_URL = https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJhbGc...
```

### Opción B: Desde CLI

```bash
# Instalar Supabase CLI
npm install -g supabase

# Loguear
supabase login

# Agregar secreto
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 3️⃣ Deployar Edge Function

### Opción 1: Dashboard (Más fácil)

```
1. Supabase Dashboard → Edge Functions
2. Create New → handle-stripe-webhook
3. Copy/paste /supabase/functions/handle-stripe-webhook/index.ts
4. Deploy
```

### Opción 2: CLI

```bash
supabase functions deploy handle-stripe-webhook
```

**Output esperado:**
```
✅ Function deployed successfully!
URL: https://xxx.supabase.co/functions/v1/handle-stripe-webhook
```

---

## 4️⃣ Registrar Webhook en Stripe

1. Ve a [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. **Add Endpoint**
3. **URL:** `https://xxx.supabase.co/functions/v1/handle-stripe-webhook`
4. **Events** → Selecciona:
   - [ ] `invoice.payment_succeeded`
   - [ ] `invoice.payment_failed`
   - [ ] `customer.subscription.deleted`
   - [ ] `charge.refunded`
5. **Add endpoint**
6. **Signing secret** → Copia (necesitas este para STRIPE_WEBHOOK_SECRET)

---

## 5️⃣ Testing Rápido

### Desde Stripe Dashboard

```
1. Ve a tu webhook endpoint
2. "Send test webhook" → invoice.payment_succeeded
3. Expectations:
   - Response: 200 OK ✅
   - En Supabase logs: "✅ Payment processed for..."
```

### Desde CLI de Stripe

```bash
# Forward webhooks a tu máquina
stripe listen --forward-to http://localhost:3000/functions/v1/handle-stripe-webhook

# En otra terminal, trigger evento
stripe trigger invoice.payment_succeeded
```

---

## 6️⃣ Ver Logs de la Edge Function

**Supabase Dashboard:**
1. Edge Functions → handle-stripe-webhook
2. Pestaña "Logs"
3. Deberías ver:
```
📨 Processing Stripe event: invoice.payment_succeeded
💳 Payment succeeded for customer cus_xxx
✅ Payment processed for user@example.com
```

---

## 7️⃣ Verificar que Supabase se Actualizó

```sql
-- En Supabase SQL Editor

-- 1. Ver usuarios con acceso
SELECT email, has_access, updated_at 
FROM users 
ORDER BY updated_at DESC 
LIMIT 1;

-- 2. Ver subscriptions
SELECT user_id, status, stripe_subscription_id 
FROM subscriptions 
ORDER BY updated_at DESC 
LIMIT 1;

-- 3. Ver transacciones
SELECT user_id, amount, type, status 
FROM transactions 
ORDER BY created_at DESC 
LIMIT 1;

-- 4. Ver email logs
SELECT user_id, type, status 
FROM email_logs 
WHERE type LIKE '%payment%'
ORDER BY created_at DESC 
LIMIT 1;
```

---

## ❌ Troubleshooting

### "401 Unauthorized"
**Causa:** Firma de Stripe inválida  
**Solución:** 
- Verifica que STRIPE_WEBHOOK_SECRET sea exactamente igual
- Síncronizalo en Supabase Secrets exactamente

### "500 Internal Server Error"
**Causa:** Error en la lógica
**Solución:**
- Abre logs en Supabase
- Busca "❌ Error..."
- Verifica permisos RLS en tablas

### "User not found"
**Causa:** stripe_customer_id no existe en BD
**Solución:**
- Verifica que createCheckoutSession() haya guardado el customer ID
- Revisa tabla `users.stripe_customer_id`

### "No se crean logs en email_logs"
**Causa:** Permiso RLS
**Solución:**
- Supabase → SQL Editor
- Corre: `ALTER POLICY ... ON email_logs ENABLE;`

---

## 📦 Archivos Creados

```
/supabase/functions/
  └─ handle-stripe-webhook/
      ├─ index.ts          (Edge Function principal)
      └─ deno.json         (Deps)

/docs/
  ├─ FASE5_COMPLETADA.md  (Documentación completa)
  └─ SETUP_STRIPE_WEBHOOK.md (Este archivo)
```

---

## ✅ Checklist Final

- [ ] Secretos agregados en Supabase Dashboard
- [ ] Edge Function deployada
- [ ] URL de webhook copiada
- [ ] Webhook registrado en Stripe Dashboard
- [ ] 4 eventos seleccionados
- [ ] STRIPE_WEBHOOK_SECRET actualizado
- [ ] Test webhook enviado desde Stripe
- [ ] Logs visibles en Supabase
- [ ] Tabla `users.has_access` actualizada a true
- [ ] Tabla `subscriptions` actualizada
- [ ] Transacción creada en tabla `transactions`
- [ ] Email log creado en `email_logs`

---

## 🚀 Siguiente Paso

Una vez todo funcione:

**FASE 6 — Testing & Despliegue**
- [ ] Prueba flujo completo: Paywall → Stripe → Webhook → Dashboard
- [ ] Verifica que usuario tenga acceso completo
- [ ] Prueba cancelación de suscripción
- [ ] Prueba reembolso

---

¿Necesitas ayuda con alguno de estos pasos? Avísame cuál es el problema 💬
