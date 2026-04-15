# 🛡️ INSTRUCCIONES: REEMPLAZAR ADMIN PANEL

## Paso 1: Respaldar el archivo actual
```bash
cp src/pages/AdminPanel.jsx src/pages/AdminPanel.jsx.backup
```

## Paso 2: Copiar el nuevo archivo
El archivo `ADMIN_PANEL_NEW.jsx` ya está en la raíz del proyecto. Reemplázalo directamente:

```bash
cp ADMIN_PANEL_NEW.jsx src/pages/AdminPanel.jsx
```

O si prefieres manual:
1. Abre `ADMIN_PANEL_NEW.jsx`
2. Copia TODO el contenido (Ctrl+A → Ctrl+C)
3. Abre `src/pages/AdminPanel.jsx`
4. Selecciona TODO (Ctrl+A)
5. Reemplaza con el contenido copiado (Ctrl+V)
6. Guarda (Ctrl+S)

## Paso 3: Verificar que se ejecute sin errores

En VS Code, deberías ver que el archivo se compila sin errores. Si ves errores rojos:

- Si ves: `"useAuth" is not exported from useAuth`
  → Verifica que `src/hooks/useAuth.js` existe y exporta `useAuth`
  
- Si ves: `"emailService" is not found`
  → Verifica que `src/services/emailService.js` existe
  
- Si ves: `"@/components/ui/..."`
  → Verifica que tienes shadcn/ui instalado: `npx shadcn-ui@latest init`

## Paso 4: Imports necesarios (verificar que están)

El archivo importa estos componentes de shadcn/ui:
- Card
- Input
- Button
- Label
- Badge
- Select (con SelectContent, SelectItem, SelectTrigger, SelectValue)
- Tabs (con TabsContent, TabsList, TabsTrigger)
- Table (con TableBody, TableCell, TableHead, TableHeader, TableRow)
- Checkbox

Si falta alguno:
```bash
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add button
# etc...
```

## Paso 5: Librerías externas necesarias

Verifica que tienes estas instaladas:
```bash
npm install lucide-react sonner date-fns
```

## Paso 6: Configurar AuthProvider en Layout.jsx

Abre `src/Layout.jsx` y envuelve el contenido con `<AuthProvider>`:

```jsx
import { AuthProvider } from '@/hooks/useAuth'

export default function Layout() {
  return (
    <AuthProvider>
      {/* Tu contenido actual va aquí */}
    </AuthProvider>
  )
}
```

## Paso 7: Pruebas

1. Navega a `http://localhost:5173/admin` (o donde esté tu ruta admin)
2. Deberías ver un mensaje de "Acceso Denegado" si NO eres admin
3. Si eres admin, deberías ver 3 tabs:
   - 👥 Usuarios (lista de todos los usuarios)
   - ➕ Crear Usuario (formulario de creación)
   - 📧 Campaña Email (enviar emails a grupos)

## ⚠️ IMPORTANTE: SQL SCHEMA

Antes de que funcione TODO, debes haber ejecutado `supabase-setup.sql` en Supabase:

1. Abre Supabase Dashboard
2. Vete a SQL Editor
3. Crea nueva query
4. Copia TODO el contenido de `supabase-setup.sql`
5. Ejecuta (Ctrl+Enter)

Sin la schema, las tablas no existen y los hooks fallarán.

## 📋 Verificación

Para verificar que todo está funcionando:

```javascript
// En la consola del browser:
// 1. Loguéate como admin
// 2. Abre DevTools (F12)
// 3. Vete a AdminPanel
// 4. Si ves los 3 tabs → ¡Esto es correcto!
```

## ❌ Troubleshooting

**Error: "No se puede leer la propiedad 'auth' de undefined"**
- Solución: Tu `useAuth()` hook debe estar envolviendo a toda la app
- Abre `src/Layout.jsx` y añade `<AuthProvider>` si no está

**Error: "Request failed with status code 401"**
- Solución: Tu usuario no tiene permisos en Supabase
- Verifica que el usuario está logueado como admin
- Verifica que RLS policies están correctas en Supabase

**Error: "Module not found: icones lucide-react"**
- Solución: `npm install lucide-react`

**Tab de "Crear Usuario" no funciona**
- Solución: Asegúrate que `src/services/userService.js` existe
- El hook `useCreateUserManually` debe estar en `src/hooks/useUser.js`

---

✅ **Una vez completado, tu admin panel tendrá:**
- ✅ Vista de todos los usuarios (con búsqueda y filtros)
- ✅ Edición de usuarios (plan, rol, features, acceso)
- ✅ Creación manual de nuevos usuarios (admin)
- ✅ Campaña de email a grupos de usuarios
- ✅ Generación aleatoria de contraseñas
- ✅ Auditoría de acciones admin
