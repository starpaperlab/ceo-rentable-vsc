# 🚀 SETUP COMPLETO - CEO RENTABLE OS™ with Supabase

## ÍNDICE
1. [Paso 1: Schema SQL en Supabase](#paso-1-schema-sql)
2. [Paso 2: Reemplazar AdminPanel.jsx](#paso-2-reemplazar-adminpanel)
3. [Paso 3: Configurar Auth Context](#paso-3-auth-context)
4. [Paso 4: Revertir otros archivos a Supabase](#paso-4-revertir-archivos)
5. [Paso 5: Verificar funcionamiento](#paso-5-verificar)

---

## PASO 1: Schema SQL en Supabase

### 1.1 Accede al SQL Editor de Supabase
- Ve a tu proyecto Supabase: https://supabase.com/dashboard
- Click en **SQL Editor** (lado izquierdo)
- Click en **"New Query"**

### 1.2 Copia-Pega TODO el contenido de `supabase-setup.sql`
**Archivo:** `/Users/star.espinal/Downloads/ceo-rentable-os-system-main/supabase-setup.sql`

**Copiar TODO y pegar en Supabase SQL Editor**

### 1.3 Ejecuta (Click en botón "RUN")

✅ Verás las tablas creadas en **Table Editor**

---

## PASO 2: Reemplazar AdminPanel.jsx

El AdminPanel actual usa `base44`. Necesitas reemplazarlo con la versión Supabase que ya créé.

### Opción A: Reemplazar manualmente
1. Abre: `/src/pages/AdminPanel.jsx`
2. Selecciona TODO (Cmd+A)
3. Cópia del archivo: `ADMIN_PANEL_NEW.jsx` (archivo que te crearé)
4. Pega

### Opción B: Usar terminal
```bash
cp ADMIN_PANEL_NEW.jsx src/pages/AdminPanel.jsx
```

---

## PASO 3: Configurar Auth Context

La app necesita saber quién es el usuario logeado. Ya creé `useAuth.js` hook.

### 3.1 Usa en tu main.jsx o Layout.jsx

```jsx
import { AuthProvider } from '@/hooks/useAuth'

root.render(
  <AuthProvider>
    <App />
  </AuthProvider>
)
```

### 3.2 Usar en componentes

```jsx
import { useAuth } from '@/hooks/useAuth'

export default function MiComponente() {
  const { user, userProfile, isAdmin, hasAccess } = useAuth()

  if (!isAdmin()) return <p>No tienes permisos</p>

  return <div>Bienvenido {userProfile.full_name}</div>
}
```

---

## PASO 4: Revertir otros archivos a Supabase

Ya cambié estos archivos de `supabase` a `base44`:
- ❌ Dashboard.jsx
- ❌ Products.jsx
- ❌ Profitability.jsx
- ❌ Login.jsx
- ❌ Onboarding.jsx

### Necesitas revertir a Supabase en todos

**Patrón de cambio:**

```jsx
// ❌ ANTES (base44)
import { base44 } from '@/api/base44Client'
const user = await base44.auth.me()

// ✅ DESPUÉS (Supabase)
import { supabase } from '@/lib/supabase'
const { data: { user } } = await supabase.auth.getUser()
```

---

## PASO 5: Verificar funcionamiento

### 5.1 Inicia la app
```bash
npm run dev
```

### 5.2 Ve a AdminPanel
- URL: `/admin` (o wherever AdminPanel está rutado)
- Deberías ver: "Acceso Denegado" si no eres admin
- O verías el panel si eres admin

### 5.3 Crea un usuario de prueba
1. En **SQL Editor de Supabase**, ejecuta:

```sql
-- Crear usuario admin
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at)
VALUES ('admin@example.com', crypt('password123', gen_salt('bf')), NOW(), NOW());

-- Luego obtén su ID y úsalo aquí:
INSERT INTO public.users (id, email, full_name, plan, role, has_access)
VALUES (
  'UUID_QUE_OBTUVISTE', -- Reemplaza con el ID del usuario creado
  'admin@example.com',
  'Admin Principal',
  'admin',
  'admin',
  true
);
```

### 5.4 Loguéate con admin@example.com / password123

---

## SERVICIOS CREADOS

### useAuth() - Hook de Autenticación
```jsx
const { user, userProfile, loading, login, signup, logout, isAdmin, hasAccess } = useAuth()
```

### useUser() - Hook de Gestión de Usuarios
```jsx
const { data: user } = useUser(userId)
const { data: allUsers } = useAllUsers({ plan: 'founder' })
const createMutation = useCreateUserManually()
```

### emailService - Manejo de Emails
```jsx
import { emailService } from '@/services/emailService'

// Enviar email
await emailService.sendEmail(templateId, recipient, variables)

// Enviar campaña broadcast
await emailService.sendCampaign(campaignId)
```

### userService - Operaciones de Usuarios
```jsx
import { userService } from '@/services/userService'

// Crear usuario
await userService.createUserManually({ email, password, plan, ... })

// Activar/Desactivar
await userService.updateUserAccess(userId, true)

// Cambiar plan
await userService.updateUserPlan(userId, 'subscription')
```

---

## ESTRUCTURA DE PLANES

### 🏅 FOUNDER (Lifetime)
- ✅ Acceso de por vida
- ✅ Luna access (básico)
- ❌ Automatizaciones
- ❌ Nuevas funciones

### ⭐ SUBSCRIPTION (Mensual - $49.99)
- ✅ Acceso de por vida
- ✅ Luna access
- ✅ Automatizaciones
- ✅ Nuevas funciones

### 🛡 ADMIN (Lifetime)
- ✅ Panel administrativo
- ✅ Crear usuarios manualmente
- ✅ Enviar emails en campaña
- ✅ Ver audit logs
- ✅ Todas las features

---

## PRÓXIMOS PASOS

1. ✅ Ejecuta el SQL en Supabase
2. ✅ Reemplaza AdminPanel.jsx
3. ✅ Configura AuthProvider en main.jsx
4. ✅ Revert todos los archivos a Supabase
5. ⏳ Integra Stripe webhooks (próxima fase)
6. ⏳ Automatiza creación de usuarios post-pago
7. ⏳ Email verification + templates

---

## 🆘 ERRORES COMUNES

### "Cannot find module '@/hooks/useAuth'"
- Verifica que los archivos existan en `src/hooks/` y `src/services/`
- Restart el servidor: `npm run dev`

### "Role level security (RLS) error"
- Las tablas están protegidas por RLS
- El usuario logeado debe tener permiso
- Verifica que el usuario esté en la tabla `public.users`

### "user_id does not exist"
- Asegúrate de crear el usuario en AMBAS tablas:
  1. `auth.users` (Supabase auth)
  2. `public.users` (tu tabla de perfiles)

---

## ARCHIVOS CREADOS

```
✅ supabase-setup.sql          (Schema SQL)
✅ src/hooks/useAuth.js         (Auth context)
✅ src/hooks/useUser.js         (User management)
✅ src/services/emailService.js (Email broadcast)
✅ src/services/userService.js  (User operations)
⏳ src/pages/AdminPanel.jsx     (Admin dashboard - necesita reemplazo)
```

---

**¿Dudas? Pregunta paso a paso. Vamos a hacerlo funcionar 💪**
