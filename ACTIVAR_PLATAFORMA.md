# 🚀 GUÍA COMPLETA: ACTIVAR LA PLATAFORMA SUPABASE

Este es el plan paso-a-paso para activar completamente tu plataforma con Supabase, reemplazando Base44.

## 📋 CHECKLIST PRINCIPAL

```
NIVEL 1 - INFRAESTRUCTURA (CRÍTICO - Debe completarse primero)
[ ] 1.1 Ejecutar supabase-setup.sql en Supabase Dashboard
[ ] 1.2 Verificar que todas las tablas se crearon (usuarios, planes, subscripciones, etc.)

NIVEL 2 - BACKEND (Hooks y Servicios)
[ ] 2.1 Verificar que existen todos los archivos:
      - src/hooks/useAuth.js
      - src/hooks/useUser.js
      - src/services/emailService.js
      - src/services/userService.js
      - supabase-setup.sql
      
[ ] 2.2 Instalar librerías externas si faltan:
      npm install sonner date-fns lucide-react

NIVEL 3 - COMPONENTES (Interfaces)
[ ] 3.1 Reemplazar AdminPanel.jsx con ADMIN_PANEL_NEW.jsx
[ ] 3.2 Actualizar src/Layout.jsx (usar AuthProvider)
[ ] 3.3 Actualizar src/main.jsx (envolver App con AuthProvider)

NIVEL 4 - MIGRACIÓN (Base44 → Supabase)
[ ] 4.1 Revertir Dashboard.jsx a Supabase
[ ] 4.2 Revertir Login.jsx a Supabase Auth
[ ] 4.3 Revertir Products.jsx a Supabase
[ ] 4.4 Revertir Profitability.jsx a Supabase
[ ] 4.5 Revertir Onboarding.jsx a Supabase

NIVEL 5 - VERIFICACIÓN (Testing)
[ ] 5.1 No hay errores de TypeScript/Linter
[ ] 5.2 Aplicación inicia sin errores
[ ] 5.3 Puedo loguear con usuario admin
[ ] 5.4 AdminPanel funciona y veo las 3 tabs
[ ] 5.5 Puedo crear usuario nuevo desde AdminPanel
[ ] 5.6 Puedo listar y editar usuarios
```

---

## ⚡ PASO 1: EJECUTAR SCHEMA SQL

### 1.1 Abre Supabase Dashboard
1. Ve a https://app.supabase.com
2. Selecciona tu proyecto
3. En el sidebar, busca **SQL Editor**

### 1.2 Crea una nueva query
1. Haz clic en **+ New Query**
2. Copia TODO el contenido de `supabase-setup.sql`
3. Pégalo en el editor
4. Presiona **Ctrl+Enter** o haz clic en ▶️ **Run**

### 1.3 Verifica que se ejecutó correctamente
Si ves confetti 🎉 al final, ¡success!

Si ves error, verifica:
- Estás en la BD correcta (esquema público)
- Tienes permisos de admin en Supabase
- La BD no tiene las tablas ya (si lo tienes, borra primero)

### 1.4 Verifica las tablas
En Supabase Dashboard → **Table Editor** deberías ver:
- users (tabla extendida de auth.users)
- plans
- subscriptions
- payments
- email_templates
- email_logs
- email_campaigns
- audit_logs

---

## 🔧 PASO 2: INSTALAR LIBRERÍAS

Abre terminal y ejecuta:
```bash
cd /Users/star.espinal/Downloads/ceo-rentable-os-system-main
npm install sonner date-fns lucide-react
```

Si ya están instaladas, npm dirá "already satisfied".

---

## 🎨 PASO 3: ACTUALIZAR LAYOUT.JSX

El Layout.jsx usa `base44.auth.me()` que no funcionará con Supabase.

### Opción A: Reemplazar manualmente (recomendado)

Abre `src/Layout.jsx` y haz estos cambios:

**CAMBIO 1: Reemplaza el import de base44**
```javascript
// BUSCA ESTO:
import { base44 } from '@/api/base44Client';

// CÁMBIALO A:
import { useAuth } from '@/hooks/useAuth';
```

**CAMBIO 2: Reemplaza la lógica de usuario**
```javascript
// BUSCA ESTO:
export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleLogout = () => {
    base44.auth.logout();
  };

// CÁMBIALO A:
export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { userProfile, user, logout, isAdmin } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

// Y DONDE USES user, CÁMBIALO A userProfile:
// BUSCA: {user?.full_name?.[0]?.toUpperCase() || 'U'}
// CÁMBIALO A: {userProfile?.full_name?.[0]?.toUpperCase() || 'U'}

// BUSCA: {user?.full_name || 'Usuario'}
// CÁMBIALO A: {userProfile?.full_name || 'Usuario'}

// BUSCA: {user?.email || ''}
// CÁMBIALO A: {userProfile?.email || ''}

// BUSCA: user?.role === 'admin'
// CÁMBIALO A: isAdmin?.()
```

---

## 🎯 PASO 4: ACTUALIZAR MAIN.JSX O APP.JSX

Necesitas envolver tu app con `<AuthProvider>` para que `useAuth()` funcione globalmente.

Abre `src/main.jsx`:

```javascript
// BUSCA ALGO COMO:
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// CÁMBIALO A:
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from '@/hooks/useAuth'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
```

---

## 📱 PASO 5: REEMPLAZAR ADMIN PANEL

Este es el cambio más grande. Puedes hacerlo de 2 maneras:

### Opción A: Reemplazar automáticamente (recomendado)
```bash
cp ADMIN_PANEL_NEW.jsx src/pages/AdminPanel.jsx
```

### Opción B: Reemplazar manualmente
1. Abre `ADMIN_PANEL_NEW.jsx`
2. Copia TODO (Ctrl+A → Ctrl+C)
3. Abre `src/pages/AdminPanel.jsx`
4. Selecciona TODO (Ctrl+A)
5. Pega (Ctrl+V)
6. Guarda (Ctrl+S)

**Importante:** Haz backup primero:
```bash
cp src/pages/AdminPanel.jsx src/pages/AdminPanel.jsx.backup
```

---

## 🔄 PASO 6: MIGRAR OTHER PAGES

Sigue el archivo `MIGRACION_BASE44_SUPABASE.md` para migrar uno por uno:

### 6.1 Dashboard.jsx
1. Abre el archivo
2. Reemplaza imports (base44 → supabase + useAuth)
3. Reemplaza `base44.auth.me()` → `useAuth()` hook
4. Reemplaza `base44.db.get()` → `supabase.from().select()`
5. Guarda

### 6.2 Login.jsx
1. Similar a Dashboard, pero enfocado en autenticación
2. Usa `useAuth()` hook para login/signup
3. Usa localStorage de Supabase Auth (manejado automáticamente)

### 6.3 Products.jsx
1. Usa React Query para queries
2. Reemplaza `base44.db.get('products')` → `supabase.from('products').select('*')`

### 6.4 Profitability.jsx
1. Similar a Products, pero con agregaciones (sum, count, etc.)

### 6.5 Onboarding.jsx
1. Reemplaza `base44.db.insert()` → `supabase.from().insert()`

---

## ✅ PASO 7: VERIFICACIÓN

### 7.1 Verifica que no hay errores
```bash
npm run dev
```

Deberías ver:
```
  VITE v... ready in ... ms

  ➜  Local:   http://localhost:5173/
```

Si hay errores rojos, lee el mensaje de error en la terminal.

### 7.2 Abre http://localhost:5173 en tu navegador

Deberías ver la página de login.

### 7.3 Intenta loguear

Usa estas credenciales (creadas por supabase-setup.sql):

**Usuario admin:**
- Email: `admin@example.com`
- Password: `admin123`

Si ves un error, verifica:
- ¿Ejecutaste supabase-setup.sql?
- ¿El usuario admin@example.com existe en Supabase?
- ¿Las credenciales son correctas?

---

## 🛡️ PASO 8: PRUEBA ADMIN PANEL

### 8.1 Navega a Admin Panel
Deberías ver un botón "Admin Panel" en la barra lateral (si estás logueado como admin).

### 8.2 Verifica las 3 tabs

**Tab 1: 👥 Usuarios**
- Deberías ver una tabla con usuarios
- Deberías poder buscar y filtrar
- Deberías poder editar usuarios (click en lápiz)

**Tab 2: ➕ Crear Usuario**
- Deberías poder rellenar un formulario
- Deberías poder generar contraseña aleatoria (🔑)
- Deberías poder marcar features (luna, automatizaciones, etc.)
- Deberías poder crear usuario (botón "Crear Usuario")

**Tab 3: 📧 Campaña Email**
- Deberías poder seleccionar un template de email
- Deberías poder elegir a quién enviar (todos, founder, suscripción, admin)
- Deberías poder enviar la campaña

### 8.3 Prueba crear un usuario

1. Haz clic en tab "➕ Crear Usuario"
2. Rellena el formulario:
   - Nombre: "Test User"
   - Email: "test@example.com"
   - Contraseña: "TestPassword123"
   - Plan: "subscription"
3. Haz clic en "Crear Usuario"
4. Si ves ✅ verde, ¡SUCCESS!
5. Si ves ❌ rojo, lee el error

### 8.4 Verifica que se creó

1. Haz clic en tab "👥 Usuarios"
2. Deberías ver "test@example.com" en la lista
3. Deberías poder buscarlo, filtrarlo, y editarlo

---

## 🔐 PASO 9: CONFIGURAR PERMISOS (RLS)

Tus tablas tienen políticas de seguridad (RLS - Row Level Security) que limitan quién puede ver qué.

Esto es **correcto** para producción y **seguro**.

Si un usuario no admin intenta acceder a datos de otros usuarios, la BD rechazará la request automáticamente.

Si ves error "permission denied", verifica:
1. ¿El usuario está logueado?
2. ¿El usuario tiene permisos? (Si es admin, podrá acceder a todo)
3. ¿Las políticas de RLS están bien configuradas?

Para ver/editar RLS en Supabase:
- Supabase Dashboard → Authentication → Policies
- Selecciona la tabla
- Verifica que las políticas coinciden con supabase-setup.sql

---

## 🚀 PASO 10: PRÓXIMOS PASOS

Una vez que TODO funciona:

### 10.1 Configura Stripe
1. Crea una cuenta en stripe.com
2. Obtén API keys
3. Configura webhooks para actualizar `has_access` cuando se pague
4. Crea un componente de checkout

### 10.2 Configura Email Templates
1. Abre Admin Panel → Crear Email (si la tab existe)
2. Crea templates por defecto:
   - "Bienvenida": Te damos la bienvenida {{name}}
   - "Pago Confirmado": Tu pago de ${{amount}} ha sido confirmado
   - "Acceso Activo": Tu acceso ha sido activado
   - "Renovación": Tu suscripción vence pronto

### 10.3 Configura Autenticación por Email
1. En Supabase, habilita "Confirm email" (Authentication → Settings)
2. Actualiza Login.jsx para mostrar "Por favor confirma tu email"
3. Configura Resend para enviar emails de confirmación

### 10.4 Deploy a producción
1. Usa Vercel, Netlify, o similar
2. Configura variables de entorno (VITE_SUPABASE_URL, etc.)
3. Deploy

---

## 📞 TROUBLESHOOTING

### Error: "useAuth is not exported from /hooks/useAuth"
**Solución:** Verifica que `src/hooks/useAuth.js` existe y tiene:
```javascript
export { AuthProvider, useAuth }
```

### Error: "Cannot read property 'auth' of undefined"
**Solución:** Asegúrate que la app está envuelta con `<AuthProvider>` en main.jsx

### Error: "supabase is not defined"
**Solución:** Verifica que `src/lib/supabase.js` existe y exporta:
```javascript
export const supabase = createClient(...)
```

### Error: "RLS policy ... denied"
**Solución:** El usuario no tiene permisos. Verifica:
- ¿Está logueado?
- ¿Las políticas RLS son correctas?
- ¿El usuario es admin?

### Error: "Email already exists"
**Solución:** El email ya está registrado. Intenta con otro o borra el usuario en Supabase.

### Error: "Password should be at least 6 characters"
**Solución:** Usa contraseñas de al menos 6 caracteres.

---

## 📊 INFORMACIÓN DE PLANES

Los 3 planes están preconfigurados:

| Plan | Precio | Duración | Features | Acceso |
|------|--------|----------|----------|--------|
| 🏅 Founder | $999 | Lifetime | Todo | ✅ |
| ⭐ Subscription | $49.99 | Mensual | Luna + Automatizaciones | Pago requerido |
| 🛡 Admin | $0 | Lifetime | Todo | ✅ (Admin solo) |

---

## 🎉 ¡FELICIDADES!

Si completaste todos los pasos, tu plataforma está lista con:
- ✅ Supabase como BD
- ✅ Admin panel funcional
- ✅ Gestión de usuarios
- ✅ Campañas de email
- ✅ Auditoría de acciones
- ✅ Control de acceso por plan
- ✅ Seguridad con RLS

Próximo: Configura Stripe para pagos y email para notificaciones.

---

## 📞 SOPORTE

Si tienes problemas:

1. **Revisa los logs:** F12 → Console → busca errores rojos
2. **Revisa Supabase Logs:** Dashboard → Logs → Edge Function Logs
3. **Verifica la BD:** Dashboard → SQL Editor → SELECT * FROM users
4. **Reinicia el servidor:** Ctrl+C en terminal, luego `npm run dev`
5. **Limpia caché:** Ctrl+Shift+Del en el navegador
