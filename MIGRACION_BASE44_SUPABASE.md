# 📄 MIGRACIÓN: BASE44 → SUPABASE

Este archivo contiene instrucciones paso a paso para revertir cada página de Base44 a Supabase.

## 🎯 Orden recomendado

1. **Dashboard.jsx** ← Comienza aquí (datos de usuario actual)
2. **Login.jsx** (autenticación)
3. **Products.jsx** (mostrar productos)
4. **Profitability.jsx** (análisis)
5. **Onboarding.jsx** (flow de nuevo usuario)

---

## 1️⃣ DASHBOARD.JSX

### Cambios principales

**ANTES (Base44):**
```javascript
import { base44 } from '@/api/base44Client'

async function loadData() {
  const user = await base44.auth.me()
  const data = await base44.db.get('usuarios', user.id)
}
```

**DESPUÉS (Supabase):**
```javascript
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const { userProfile, user } = useAuth()
  const [data, setData] = useState(null)
  
  useEffect(() => {
    if (user?.id) {
      loadData(user.id)
    }
  }, [user?.id])

  async function loadData(userId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    setData(data)
  }
}
```

### Pasos específicos

Reemplaza:
```
base44.auth.me() 
→ useAuth() hook. El usuario está en: userProfile.id
```

```
base44.db.get('tabla', id)
→ supabase.from('tabla').select('*').eq('id', id).single()
```

```
base44.db.query({ filter: {...} })
→ supabase.from('tabla').select('*').match({...filter...})
```

---

## 2️⃣ LOGIN.JSX

### Cambios principales

**ANTES (localStorage mock):**
```javascript
function handleLogin() {
  localStorage.setItem('user', JSON.stringify({...}))
  navigate('/dashboard')
}
```

**DESPUÉS (Supabase Auth):**
```javascript
import { useAuth } from '@/hooks/useAuth'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (error) {
      toast.error('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleLogin}>
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@email.com"
        required
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        required
      />
      <Button disabled={loading}>
        {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
      </Button>
    </form>
  )
}
```

### Pasos específicos

1. Reemplaza localStorage mock con `useAuth()` hook
2. Usa `login(email, password)` en lugar de guardar en localStorage
3. El hook maneja automáticamente el redirect y la sesión de Supabase
4. Para testing: usa el usuario admin creado en supabase-setup.sql (email: admin@example.com, password: admin123)

---

## 3️⃣ PRODUCTS.JSX

### Cambios principales

**ANTES (Base44):**
```javascript
import { base44 } from '@/api/base44Client'

function ProductsPage() {
  const [products, setProducts] = useState([])

  useEffect(() => {
    async function load() {
      const data = await base44.db.get('products')
      setProducts(data)
    }
    load()
  }, [])
}
```

**DESPUÉS (Supabase + React Query):**
```javascript
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'

function ProductsPage() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
  })

  if (isLoading) return <LoadingSpinner />
  
  return (
    // Renderizar productos
  )
}
```

### Pasos específicos

1. Reemplaza `base44.db.get('products')` con Supabase query
2. Si tienes mutaciones (crear, editar, borrar):
   ```javascript
   const mutation = useMutation({
     mutationFn: async (newProduct) => {
       const { data, error } = await supabase
         .from('products')
         .insert([newProduct])
       if (error) throw error
       return data
     },
     onSuccess: () => queryClient.invalidateQueries(['products'])
   })
   ```
3. Asegúrate de que los nombres de tablas en Supabase coinciden (products, items, etc.)

---

## 4️⃣ PROFITABILITY.JSX

### Cambios principales

Similar a Products.jsx, pero probablemente con agregaciones:

**ANTES (Base44):**
```javascript
const data = await base44.db.get('invoices', {
  status: 'paid',
  user_id: currentUser.id
})
```

**DESPUÉS (Supabase):**
```javascript
const { data } = await supabase
  .from('invoices')
  .select('*')
  .eq('status', 'paid')
  .eq('user_id', userId)
```

Para cálculos de rentabilidad (si necesitas aggregate):
```javascript
const { data } = await supabase
  .from('invoices')
  .select('amount, date')
  .eq('user_id', userId)
  .gte('date', startDate)
  .lte('date', endDate)

// Luego haz los cálculos en JavaScript
const total = data?.reduce((sum, inv) => sum + inv.amount, 0)
```

---

## 5️⃣ ONBOARDING.JSX

### Cambios principales

**ANTES (Base44 insert):**
```javascript
async function completeOnboarding() {
  await base44.db.insert('usuarios', {
    name: formData.name,
    email: formData.email,
    // ...
  })
}
```

**DESPUÉS (Supabase):**
```javascript
async function completeOnboarding() {
  // 1. Opción A: crear usuario vía Supabase Auth + perfil
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password
  })
  
  if (authError) throw authError

  // 2. Crear perfil en tabla public.users
  const { error: profileError } = await supabase
    .from('users')
    .insert([{
      id: authData.user.id,
      email: formData.email,
      full_name: formData.name,
      plan: 'subscription',
      has_access: false, // Pendiente de pago
      created_at: new Date()
    }])
  
  if (profileError) throw profileError

  toast.success('✅ Registro completado. Procede al pago.')
  navigate('/billing')
}
```

---

## 🔄 PATRÓN GENERAL: Reemplazar base44

### 1. Reemplaza imports
```javascript
// ANTES
import { base44 } from '@/api/base44Client'

// DESPUÉS
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useQuery, useMutation } from '@tanstack/react-query'
```

### 2. Reemplaza consultas
```javascript
// ANTES (Base44 - síncrono vía SDK)
const user = base44.auth.me()
const data = base44.db.get('table')

// DESPUÉS (Supabase - async)
const { user } = useAuth()
const { data } = await supabase.from('table').select('*')
```

### 3. Reemplaza mutaciones
```javascript
// ANTES
base44.db.update('table', id, { field: value })

// DESPUÉS
await supabase
  .from('table')
  .update({ field: value })
  .eq('id', id)
```

### 4. Reemplaza eliminaciones
```javascript
// ANTES
base44.db.delete('table', id)

// DESPUÉS
await supabase
  .from('table')
  .delete()
  .eq('id', id)
```

---

## ✅ Checklist de verificación

- [ ] Ejecuté supabase-setup.sql en Supabase dashboard
- [ ] Actualicé src/Layout.jsx con `<AuthProvider>`
- [ ] Reemplacé AdminPanel.jsx
- [ ] Migré Dashboard.jsx a Supabase
- [ ] Migré Login.jsx a Supabase Auth
- [ ] Migré Products.jsx a Supabase
- [ ] Migré Profitability.jsx a Supabase
- [ ] Migré Onboarding.jsx a Supabase
- [ ] No hay errores en la consola
- [ ] Puedo loguearme con credenciales Supabase
- [ ] Vi el AdminPanel sin errores
- [ ] Crear nuevo usuario funciona
- [ ] Enviar email funciona

---

## 🚀 Próximos pasos

Una vez migrado TODO:

1. Configura Stripe webhooks para actualizar `has_access` cuando se marque un pago
2. Configura autenticación por email (verificación)
3. Configura templates de email por defecto
4. Prueba el flujo completo: Registro → Onboarding → Pago → Acceso activado

---

## 📞 En caso de error

**Error: "Fila no encontrada"**
- La tabla o row no existe en Supabase
- Verifica que ejecutaste supabase-setup.sql completamente

**Error: "Permiso denegado (RLS)"**
- Las políticas de seguridad (RLS) están bloqueando tu acceso
- Verifica en Supabase > Authentication > Policies que tu usuario cumple las condiciones

**Error: "Token inválido"**
- Tu sesión expiró
- Vuelve a loguear
- O verifica que el token se está guardando en localStorage

**Error: "Email ya existe"**
- Intenta con otro email
- O borra el usuario en Supabase y vuelve a intentar
