# Configuración Supabase — CEO RENTABLE OS™

## 🚀 CÓMO EJECUTAR EL SQL

### Paso 1: Abre el Supabase Studio
1. Ve a: https://supabase.com/dashboard/projects
2. Selecciona tu proyecto
3. Ve a **SQL Editor** → **New Query**

### Paso 2: Copia y pega el SQL
- Abre el archivo `SETUP_SUPABASE.sql` en la raíz del proyecto
- Copia **TODO EL CONTENIDO**
- Pégalo en la ventana de SQL Editor en Supabase
- Haz clic en **Run**

### Paso 3: Verifica la ejecución
- Deberías ver "✓ Executed successfully"
- Ve a **Database** → **Tables** para confirmar que todas las tablas se crearon

---

## 📋 TABLAS CREADAS

| Tabla | Descripción | RLS Activo |
|-------|-------------|-----------|
| `clients` | Clientes de la empresa | ✅ |
| `subscriptions` | Suscripciones Stripe | ✅ |
| `transactions` | Transacciones de pago | ✅ |
| `email_logs` | Historial de emails | ✅ |
| `email_templates` | Plantillas de email | ✅ |
| `users` | Perfil extendido | ✅ |
| `invoices` | Facturas (actualizada) | ✅ |
| `products` | Productos (actualizada) | ✅ |

---

## 🔒 ROW LEVEL SECURITY (RLS)

**Cada usuario solo puede ver y modificar SUS PROPIOS datos.**

Ejemplo de política:
- Usuario A crea un cliente → Solo usuario A lo ve
- Usuario B intenta leer el cliente de A → Error: permiso denegado
- El servidor rechaza automáticamente cualquier consulta no autorizada

---

## 🔑 VARIABLES PRIVADAS VS PÚBLICAS

### Backend (Node.js / Edge Functions)
- `SUPABASE_URL` ← Insensible
- `SUPABASE_SERVICE_ROLE_KEY` ← **SECRETO** (nunca en frontend)

### Frontend (React Vite)
- `VITE_SUPABASE_URL` ← Pública
- `VITE_SUPABASE_ANON_KEY` ← Anon key (limitada por RLS)

---

## 📦 ÍNDICES CREADOS

Para optimizar consultas frecuentes:
- `clients(user_id)` — Buscar clientes de usuario
- `invoices(user_id, status)` — Filtrar facturas por estado
- `subscriptions(stripe_subscription_id)` — Buscar por Stripe ID
- `email_logs(user_id, type)` — Análisis de emails
- `products(user_id, status)` — Consultas de inventario

---

## ⚡ SIGUIENTES PASOS

1. ✅ Ejecutar este SQL en Supabase
2. ⏳ Volver a migrar lógica de Inventory, Projection, Billing, Agenda
3. ⏳ Crear servicios: emailService.js, stripeService.js, geminiService.js
4. ⏳ Completar páginas incompletas: Onboarding, Diagnostico, Paywall
5. ⏳ Crear Edge Functions para Stripe webhooks
