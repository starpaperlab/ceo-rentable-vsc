# ⚡ QUICK START: ACTIVAR EN 30 MINUTOS

Sigue estos pasos exactos en orden. Si algo falla, lee el error.

---

## ✅ PASO 1: SQL SCHEMA (5 min)

### 1.1 Abre Supabase
Va a: https://app.supabase.com → Tu proyecto → SQL Editor → New Query

### 1.2 Copia-pega SQL
Abre el archivo `supabase-setup.sql` en tu proyecto.
Copia TODO.
Pégalo en Supabase SQL Editor.
Haz click ▶️ o presiona Ctrl+Enter.

**✅ Si ves confetti, exitoso. Continúa.**
**❌ Si ves error, lee el error y revisa supabase-setup.sql línea por línea.**

---

## ✅ PASO 2: DEPENDENCIAS (2 min)

Abre terminal en tu proyecto:

```bash
npm install sonner date-fns lucide-react
```

**✅ Si ve "npm notice", ok. Continúa.**

---

## ✅ PASO 3: MAIN.JSX (3 min)

Abre `src/main.jsx`.

**BUSCA:**
```javascript
import { AuthProvider } from '@/hooks/useAuth'
```

**SI NO LO VES, AÑADE ESTA LÍNEA al inicio junto con los otros imports.**

**BUSCA:**
```javascript
<React.StrictMode>
    <App />
</React.StrictMode>
```

**REEMPLAZA CON:**
```javascript
<React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
</React.StrictMode>
```

**✅ Guarda (Ctrl+S).**

---

## ✅ PASO 4: LAYOUT.JSX (10 min)

Abre `src/Layout.jsx`.

**LÍNEA ~4: REEMPLAZA**
```javascript
import { base44 } from '@/api/base44Client';
```

**CON:**
```javascript
import { useAuth } from '@/hooks/useAuth';
```

**LÍNEA ~43: REEMPLAZA**
```javascript
export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleLogout = () => {
    base44.auth.logout();
  };
```

**CON:**
```javascript
export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { userProfile, isAdmin, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };
```

**AHORA, REEMPLAZA CADA `user?` CON `userProfile?`:**

**BUSCA:**
```javascript
{user?.full_name?.[0]?.toUpperCase() || 'U'}
```

**REEMPLAZA CON:**
```javascript
{userProfile?.full_name?.[0]?.toUpperCase() || 'U'}
```

**BUSCA:**
```javascript
{user?.full_name || 'Usuario'}
```

**REEMPLAZA CON:**
```javascript
{userProfile?.full_name || 'Usuario'}
```

**BUSCA:**
```javascript
{user?.email || ''}
```

**REEMPLAZA CON:**
```javascript
{userProfile?.email || ''}
```

**BUSCA:**
```javascript
{user?.role === 'admin' && (
```

**REEMPLAZA CON:**
```javascript
{isAdmin?.() && (
```

**✅ Guarda (Ctrl+S).**

---

## ✅ PASO 5: ADMIN PANEL (5 min)

En terminal:
```bash
cp ADMIN_PANEL_NEW.jsx src/pages/AdminPanel.jsx
```

**✅ Archivo reemplazado.**

Si prefieres manual:
1. Abre `ADMIN_PANEL_NEW.jsx`
2. Ctrl+A → Ctrl+C (copia todo)
3. Abre `src/pages/AdminPanel.jsx`
4. Ctrl+A → Ctrl+V (reemplaza)
5. Ctrl+S (guarda)

---

## ✅ PASO 6: VERIFICA QUE FUNCIONA (5 min)

En terminal:
```bash
npm run dev
```

Deberías ver:
```
  VITE ready in X ms
  ➜  Local: http://localhost:5173/
```

**✅ Abre http://localhost:5173 en navegador.**

---

## ✅ PASO 7: LOGIN (3 min)

Deberías ver página de login.

Usa esto:
- Email: `admin@example.com`
- Password: `admin123`

Haz click "Iniciar Sesión".

**✅ Si ves Dashboard, ¡ÉXITO!**
**❌ Si ves error, lee el error en consola (F12 → Console).**

---

## ✅ PASO 8: ADMIN PANEL (2 min)

En la barra lateral, deberías ver "Admin Panel" (abajo).

Haz click.

Deberías ver 3 tabs:
- 👥 Usuarios (lista de usuarios)
- ➕ Crear Usuario (formulario)
- 📧 Campaña Email (enviar email)

**✅ Si ves los 3 tabs, ¡ÉXITO!**

---

## ✅ PASO 9: PRUEBA CREAR USUARIO (2 min)

1. Haz click en tab "➕ Crear Usuario"
2. Rellena:
   - Nombre: "Test User"
   - Email: "test@test.com"
   - Contraseña: "Test123456"
   - Plan: "subscription"
3. Haz click "Crear Usuario"

**✅ Si ves ✅ verde, ¡ÉXITO!**
**❌ Si ves ❌ rojo, lee el error.**

---

## ✅ PASO 10: VERIFICA QUE SE CREÓ (1 min)

1. Haz click en tab "👥 Usuarios"
2. Deberías ver "test@test.com" en la lista

**✅ Si lo ves, ¡ÉXITO TOTAL!**

---

## 🎉 ¡COMPLETADO!

Tu plataforma Supabase está activa con:
- ✅ Admin panel
- ✅ Gestor de usuarios
- ✅ Control de acceso
- ✅ Auditoría

### Próximos pasos (futuro):

1. Migra las otras páginas (Dashboard, Login, Products, etc.)
   → Sigue: `MIGRACION_BASE44_SUPABASE.md`

2. Configura Stripe para pagos
3. Configura Resend para emails
4. Deploy a producción

---

## ❌ TROUBLESHOOTING

### Error: "Can't find module '@/hooks/useAuth'"
**Solución:** Verifica que `src/hooks/useAuth.js` existe

### Error: "Cannot read property 'userProfile'"
**Solución:** 
1. Verifica que main.jsx tiene `<AuthProvider>`
2. Verifica que Layout.jsx importa `useAuth`

### Error: "RLS policy ... denied"
**Solución:** 
1. Verifica que ejecutaste supabase-setup.sql completamente
2. Verifica que estás logueado como admin

### Error: "Email already exists"
**Solución:** Usa otro email o borra el usuario en Supabase

### La página no carga nada
**Solución:** 
1. Abre DevTools: F12
2. Console → busca errores rojos
3. Lee el error y revisa el paso donde falla

---

**¿Listo? ¡Comienza por PASO 1: SQL SCHEMA!**
