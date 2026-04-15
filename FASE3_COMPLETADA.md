# FASE 3 — SERVICIOS EXTERNOS ✅ COMPLETADA

## 📦 ARCHIVOS CREADOS

| Archivo | Líneas | Funciones |
|---------|--------|-----------|
| `src/lib/emailService.js` | 380 | 5 exportadas |
| `src/lib/stripeService.js` | 420 | 5 exportadas |
| `src/lib/geminiService.js` | 350 | 4 exportadas |

---

## ✉️ **EMAIL SERVICE (emailService.js)**

### Funciones Disponibles

```javascript
// 1️⃣ Bienvenida al usuario
await sendWelcomeEmail(user)
// → HTML hermoso + log en Supabase

// 2️⃣ Confirmación de pago
await sendPaymentConfirmationEmail(user, transaction)
// → Detalles de transacción + acceso activado

// 3️⃣ Recordatorio de suscripción por vencer
await sendSubscriptionExpiringEmail(user, daysRemaining)
// → Alerta solo si < 3 días o genérica

// 4️⃣ Recuperar contraseña
await sendPasswordResetEmail(user, resetLink)
// → Link con expiración + instrucciones

// 5️⃣ Custom (broadcast, recordatorios, etc)
await sendCustomEmail(userId, toEmail, subject, htmlBody)
// → Flexible para emails personalizados
```

### Características
- ✅ Integración con Resend API
- ✅ Logging automático en `email_logs` tabla
- ✅ HTML responsivo con colores de marca
- ✅ Fallback si RESEND_API_KEY no está configurada en backend
- ✅ Validación de datos

### Ejemplo de Uso
```javascript
import { sendWelcomeEmail } from '@/lib/emailService';

const user = { id: 'uuid', email: 'user@example.com', full_name: 'Ana' };
const result = await sendWelcomeEmail(user);
// { success: true, messageId: 'msg_xxx' }
```

---

## 💳 **STRIPE SERVICE (stripeService.js)**

### Funciones Disponibles

```javascript
// 1️⃣ Crear sesión de checkout
const session = await createCheckoutSession('pro', userId)
// → { sessionId, clientSecret, publishableKey }

// 2️⃣ Procesar webhook (llamado desde Edge Function)
const result = await handleStripeWebhook(event)
// → Sincroniza: pagos, suscripciones, reembolsos

// 3️⃣ Cancelar suscripción
const result = await cancelSubscription(userId)
// → Marca como canceled/cancel_at_period_end

// 4️⃣ Obtener estado de suscripción
const sub = await getSubscriptionStatus(userId)
// → { plan: 'pro', status: 'active', currentPeriodEnd, ... }

// 5️⃣ Información de planes
const plans = getPlans()
// → { basico: {...}, pro: {...} }
```

### Planes Disponibles
| Plan | Precio | Características |
|------|--------|-----------------|
| **Básico** | $27/mes | Dashboard, Inventario, Reportes, 500 emails |
| **Pro** | $47/mes | Todo + IA, Agenda, Proyecciones, Emails ilimitados, 5 usuarios |

### Eventos Stripe Manejados
- ✅ `invoice.payment_succeeded` — Pago completado → activar acceso
- ✅ `invoice.payment_failed` — Pago fallido → cambiar a past_due
- ✅ `customer.subscription.deleted` — Suscripción cancelada → desactivar acceso
- ✅ `charge.refunded` — Reembolso procesado → registrar

### Arquitectura (Frontend → Backend)
```
React Component
    ↓ createCheckoutSession(plan, userId)
Backend/Edge Function
    ↓ Crear sesión con Stripe Secret Key
Stripe
    ↓ Retorna sessionId
React
    ↓ Redirigir a checkout.stripe.com
Usuario
    ↓ Paga
Stripe
    ↓ Webhook → Edge Function
Backend
    ↓ handleStripeWebhook(event)
Supabase
    ↓ Actualizar: subscriptions, transactions, users.has_access
```

---

## 🤖 **GEMINI SERVICE (geminiService.js)**

### Funciones Disponibles

```javascript
// 1️⃣ Análisis de rentabilidad
const analysis = await analyzeProfitability({
  products: [...],
  invoices: [...]
})
// → Métricas + recomendaciones de productos

// 2️⃣ Diagnóstico completo del negocio
const diagnosis = await generateBusinessDiagnosis({
  businessName: 'Mi Negocio',
  businessType: 'servicios',
  monthlyRevenue: 15000,
  employees: 3,
  primaryChallenges: ['marketing', 'cash flow'],
  goals: ['duplicar ingresos', 'contratar 2 personas']
})
// → Análisis profundo + plan 30 días

// 3️⃣ Sugerencias de mejora
const suggestions = await suggestImprovements({
  profitMargin: 30,
  monthlyGrowth: 5,
  customerCount: 150,
  productCount: 12,
  invoiceCount: 450
})
// → 5 mejoras específicas y medibles

// 4️⃣ Chat con Luna (asistente)
const response = await chatResponse(
  '¿Cómo aumentar mis márgenes sin perder clientes?',
  { businessName: 'Mi Spa', monthlyRevenue: 8000 }
)
// → "💰 Estrategia personalizada..."
```

### Características
- ✅ Integración con Google Gemini 1.5 Flash
- ✅ Contexto personalizado (negocio del usuario)
- ✅ Sistema de fallback si IA no disponible
- ✅ Respuestas en español
- ✅ Recomendaciones accionables y medibles
- ✅ Emojis para mejor legibilidad

### Ejemplo Completo
```javascript
import { analyzeProfitability } from '@/lib/geminiService';

const data = {
  products: [
    { name: 'Servicio A', margin_pct: 45 },
    { name: 'Servicio B', margin_pct: 12 }
  ],
  invoices: [
    { total_ingresos: 5000, total_costos: 2500 },
    { total_ingresos: 3000, total_costos: 2000 }
  ]
};

const result = await analyzeProfitability(data);
console.log(result.analysis); // IA análisis completo
console.log(result.metrics); // KPIs calculados
```

---

## 🔌 **INTEGRACIÓN CON REACT COMPONENTS**

### Ejemplo: PaymentSuccess Page
```javascript
import { sendPaymentConfirmationEmail } from '@/lib/emailService';
import { getSubscriptionStatus } from '@/lib/stripeService';

export default function PaymentSuccess() {
  const { user } = useAuth();

  useEffect(() => {
    // 1. Enviar email de confirmación
    sendPaymentConfirmationEmail(user, transaction);

    // 2. Obtener estado de suscripción
    getSubscriptionStatus(user.id).then(sub => {
      console.log('Suscripción activa:', sub.active);
    });
  }, []);

  return <div>✅ ¡Pago confirmado! Acceso desbloqueado.</div>;
}
```

### Ejemplo: Diagnostico Page
```javascript
import { generateBusinessDiagnosis } from '@/lib/geminiService';

export default function Diagnostico() {
  const [diagnosis, setDiagnosis] = useState(null);

  const handleSubmit = async (answers) => {
    const result = await generateBusinessDiagnosis(answers);
    setDiagnosis(result.diagnosis);
  };

  return (
    <div>
      {diagnosis && <div>{diagnosis}</div>}
    </div>
  );
}
```

---

## 📋 CHECKLIST ANTES DE USAR

- [ ] `.env.local` tiene `RESEND_API_KEY` (backend) y `VITE_EMAIL_API_ENDPOINT` (frontend)
- [ ] `.env.local` tiene `VITE_STRIPE_PUBLIC_KEY` (para pagos)
- [ ] `.env.local` tiene `VITE_GEMINI_API_KEY` (para IA)
- [ ] Stripe account creada y productos configurados
- [ ] Resend account creada (opcional)
- [ ] Google Cloud project con Gemini API habilitada
- [ ] Edge Functions de Supabase configuradas (para Stripe webhook)

---

## 🚀 PRÓXIMOS PASOS

1. **FASE 4** — Completar páginas incompletas:
   - Onboarding.jsx (flujo de nuevo usuario)
   - Diagnostico.jsx (usa geminiService.js)
   - Paywall.jsx (usa stripeService.js)

2. **FASE 5** — Completar migraciones:
   - Inventory.jsx
   - Projection.jsx
   - Billing.jsx
   - Agenda.jsx

3. **FASE 6** — Testing y deployment

---

## 🔐 SEGURIDAD

⚠️ **IMPORTANTE:**
- `VITE_STRIPE_PUBLIC_KEY` es pública: OK exponerla
- `STRIPE_SECRET_KEY` debe estar SOLO en backend/Edge Functions
- Los webhooks deben validar la firma de Stripe
- Nunca confíes en input del usuario en transacciones

---

## 📚 REFERENCIAS

- Resend: https://resend.com/docs
- Stripe: https://stripe.com/docs
- Gemini API: https://ai.google.dev/
- Google Gemini Docs: https://cloud.google.com/vertex-ai/docs
