import React, { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useAllUsers, useCreateUserManually, useUpdateUser } from '@/hooks/useUser'
import { emailService } from '@/services/emailService'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  UserPlus, Mail, Users, Loader2, Search, Edit2, 
  Trash2, X, Check, Send, Eye, Copy
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function AdminPanel() {
  const { userProfile, isAdmin } = useAuth()
  const { data: users = [], isLoading } = useAllUsers()
  const createUserMutation = useCreateUserManually()
  const updateUserMutation = useUpdateUser()

  // Check if admin
  if (!isAdmin?.()) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-2">🔒 Acceso Denegado</h2>
          <p className="text-muted-foreground">Solo administradores pueden acceder a este panel</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold">🛡 Panel Administrativo</h1>
        <p className="text-muted-foreground mt-2">Gestión de usuarios, planes y campañas de email</p>
      </div>

      {/* TABS */}
      <Tabs defaultValue="usuarios" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="usuarios">👥 Usuarios ({users.length})</TabsTrigger>
          <TabsTrigger value="crear">➕ Crear Usuario</TabsTrigger>
          <TabsTrigger value="emails">📧 Campaña Email</TabsTrigger>
        </TabsList>

        {/* TAB: USUARIOS */}
        <TabsContent value="usuarios" className="space-y-4 mt-4">
          <UsersListTab users={users} isLoading={isLoading} onUpdateUser={updateUserMutation.mutate} />
        </TabsContent>

        {/* TAB: CREAR USUARIO */}
        <TabsContent value="crear" className="space-y-4 mt-4">
          <CreateUserTab onSuccess={() => toast.success('✅ Usuario creado exitosamente')} />
        </TabsContent>

        {/* TAB: CAMPAÑAS EMAIL */}
        <TabsContent value="emails" className="space-y-4 mt-4">
          <EmailCampaignsTab users={users} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// =============================================================================
// COMPONENTE: LISTA DE USUARIOS
// =============================================================================

function UsersListTab({ users, isLoading, onUpdateUser }) {
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [editingUser, setEditingUser] = useState(null)

  const filtered = users.filter(u => {
    const matchesSearch = 
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchesPlan = planFilter === 'all' || u.plan === planFilter
    return matchesSearch && matchesPlan
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* FILTROS */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los planes</SelectItem>
            <SelectItem value="founder">🏅 Founder</SelectItem>
            <SelectItem value="subscription">⭐ Suscripción</SelectItem>
            <SelectItem value="admin">🛡 Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* TABLA */}
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Acceso</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">⚙️</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan="6" className="text-center py-8 text-muted-foreground">
                  No hay usuarios con esos filtros
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(user => (
                <TableRow key={user.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{user.full_name || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {user.plan === 'founder' && <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">🏅 Founder</Badge>}
                    {user.plan === 'subscription' && <Badge className="bg-blue-100 text-blue-700 border-blue-200">⭐ Suscripción</Badge>}
                    {user.plan === 'admin' && <Badge className="bg-purple-100 text-purple-700 border-purple-200">🛡 Admin</Badge>}
                  </TableCell>
                  <TableCell>
                    {user.has_access ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200">✅ Activo</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 border-red-200">🔒 Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.created_at ? format(new Date(user.created_at), 'dd MMM yyyy', { locale: es }) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingUser(user)}
                      title="Editar usuario"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* MODAL DE EDICIÓN */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={(updates) => {
            onUpdateUser({ userId: editingUser.id, updates })
            setEditingUser(null)
            toast.success('✅ Usuario actualizado')
          }}
        />
      )}
    </div>
  )
}

// =============================================================================
// COMPONENTE: CREAR USUARIO
// =============================================================================

function CreateUserTab({ onSuccess }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    plan: 'founder',
    role: 'user',
    has_access: true,
    features: {
      luna: false,
      automatizaciones: false,
      nuevas_funciones: false
    }
  })

  const [loading, setLoading] = useState(false)
  const createUserMutation = useCreateUserManually()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await createUserMutation.mutateAsync(form)
      toast.success(`✅ Usuario ${form.email} creado`)
      
      // Reset
      setForm({
        email: '',
        password: '',
        full_name: '',
        phone: '',
        plan: 'founder',
        role: 'user',
        has_access: true,
        features: { luna: false, automatizaciones: false, nuevas_funciones: false }
      })
      onSuccess()
    } catch (error) {
      toast.error('❌ Error: ' + (error.message || 'Error desconocido'))
    } finally {
      setLoading(false)
    }
  }

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let pass = ''
    for (let i = 0; i < 12; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length))
    setForm({ ...form, password: pass })
    toast.success('🔐 Contraseña generada')
  }

  return (
    <Card className="p-6 max-w-2xl">
      <h2 className="text-xl font-bold mb-6">➕ Crear Nuevo Usuario</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* DATOS BÁSICOS */}
        <div>
          <h3 className="font-semibold text-sm mb-3">📋 Información Personal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold">Nombre Completo *</Label>
              <Input
                value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                placeholder="Ej: María García López"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="maria@example.com"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Contraseña *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generatePassword}
                  title="Generar contraseña aleatoria"
                >
                  🔑
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Teléfono</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 809 555 0000"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* PLAN Y ROL */}
        <div className="pt-4 border-t">
          <h3 className="font-semibold text-sm mb-3">🎯 Plan y Permisos</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold">Plan *</Label>
              <Select value={form.plan} onValueChange={plan => setForm({ ...form, plan })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="founder">🏅 Founder (Lifetime)</SelectItem>
                  <SelectItem value="subscription">⭐ Suscripción (Mensual $49.99)</SelectItem>
                  <SelectItem value="admin">🛡 Admin (Lifetime)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Rol del Sistema *</Label>
              <Select value={form.role} onValueChange={role => setForm({ ...form, role })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">👤 Usuario Normal</SelectItem>
                  <SelectItem value="admin">🛡 Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <div className="pt-4 border-t">
          <h3 className="font-semibold text-sm mb-3">✨ Features Disponibles</h3>
          <div className="space-y-2">
            {[
              { key: 'luna', label: '🌙 Luna (Básico)' },
              { key: 'automatizaciones', label: '⚡ Automatizaciones' },
              { key: 'nuevas_funciones', label: '✨ Nuevas Funciones' }
            ].map(feature => (
              <label key={feature.key} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-muted rounded transition">
                <Checkbox
                  checked={form.features[feature.key]}
                  onCheckedChange={checked => setForm({
                    ...form,
                    features: { ...form.features, [feature.key]: checked }
                  })}
                />
                <span className="text-sm">{feature.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ACCESO */}
        <div className="pt-4 border-t">
          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-muted rounded transition">
            <Checkbox
              checked={form.has_access}
              onCheckedChange={checked => setForm({ ...form, has_access: checked })}
            />
            <span className="text-sm font-medium">✅ Acceso inmediato a la plataforma</span>
          </label>
        </div>

        {/* BOTONES */}
        <div className="flex gap-2 pt-6 border-t justify-end">
          <Button variant="outline" type="button" onClick={() => setForm({ email: '', password: '', full_name: '', phone: '', plan: 'founder', role: 'user', has_access: true, features: { luna: false, automatizaciones: false, nuevas_funciones: false } })}>
            Limpiar
          </Button>
          <Button type="submit" disabled={loading || !form.email || !form.password || !form.full_name}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
            {loading ? 'Creando...' : 'Crear Usuario'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// =============================================================================
// COMPONENTE: CAMPAÑA EMAIL
// =============================================================================

function EmailCampaignsTab({ users }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [targetPlan, setTargetPlan] = useState('all')
  const [campaignName, setCampaignName] = useState('')

  React.useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const tpls = await emailService.getAllTemplates()
      setTemplates(tpls)
    } catch (error) {
      toast.error('Error cargando templates')
    } finally {
      setLoading(false)
    }
  }

  const handleSendCampaign = async () => {
    if (!selectedTemplate || !campaignName) {
      toast.error('Completa todos los campos')
      return
    }

    try {
      const campaign = await emailService.createCampaign({
        templateId: selectedTemplate.id,
        name: campaignName,
        targetPlan: targetPlan === 'all' ? null : targetPlan
      })

      const result = await emailService.sendCampaign(campaign.id)
      toast.success(`✅ Campaña enviada a ${result.sent}/${result.total} usuarios`)

      setSelectedTemplate(null)
      setCampaignName('')
      setTargetPlan('all')
    } catch (error) {
      toast.error('❌ Error: ' + error.message)
    }
  }

  const recipientCount = users.filter(u => 
    targetPlan === 'all' || u.plan === targetPlan
  ).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-6">📧 Enviar Campaña de Email</h2>

        <div className="space-y-5">
          {/* NOMBRE DE CAMPAÑA */}
          <div>
            <Label className="text-xs font-semibold">Nombre de Campaña *</Label>
            <Input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="Ej: Bienvenida Nuevos Usuarios"
              className="mt-1"
            />
          </div>

          {/* SELECCIONAR TEMPLATE */}
          <div>
            <Label className="text-xs font-semibold">Seleccionar Template *</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground col-span-2">No hay templates disponibles</p>
              ) : (
                templates.map(tpl => (
                  <Button
                    key={tpl.id}
                    variant={selectedTemplate?.id === tpl.id ? 'default' : 'outline'}
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setSelectedTemplate(tpl)}
                  >
                    <div>
                      <p className="font-semibold text-sm">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground">{tpl.subject}</p>
                    </div>
                  </Button>
                ))
              )}
            </div>
          </div>

          {/* DESTINATARIOS */}
          <div>
            <Label className="text-xs font-semibold">Enviar a</Label>
            <Select value={targetPlan} onValueChange={setTargetPlan}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📬 Todos los usuarios ({users.length})</SelectItem>
                <SelectItem value="founder">🏅 Solo Founder ({users.filter(u => u.plan === 'founder').length})</SelectItem>
                <SelectItem value="subscription">⭐ Solo Suscripción ({users.filter(u => u.plan === 'subscription').length})</SelectItem>
                <SelectItem value="admin">🛡 Solo Admin ({users.filter(u => u.plan === 'admin').length})</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">📊 Se enviará a: <strong>{recipientCount} usuario(s)</strong></p>
          </div>

          {/* BOTÓN ENVIAR */}
          <Button
            onClick={handleSendCampaign}
            disabled={!selectedTemplate || !campaignName}
            className="w-full h-11 mt-6"
          >
            <Send className="h-4 w-4 mr-2" /> Enviar Campaña Ahora
          </Button>
        </div>
      </Card>

      {/* TEMPLATES DISPONIBLES */}
      <div>
        <h3 className="font-semibold mb-3">📄 Templates Disponibles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map(tpl => (
            <Card key={tpl.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{tpl.subject}</p>
                </div>
                {tpl.is_active && <Badge className="bg-green-100 text-green-700">Activo</Badge>}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// MODAL: EDITAR USUARIO
// =============================================================================

function EditUserModal({ user, onClose, onSave }) {
  const [plan, setPlan] = useState(user.plan)
  const [hasAccess, setHasAccess] = useState(user.has_access)
  const [role, setRole] = useState(user.role)
  const [features, setFeatures] = useState({
    luna: user.luna_access,
    automatizaciones: user.automatizaciones_access,
    nuevas_funciones: user.nuevas_funciones_access
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">✏️ Editar: {user.full_name}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* PLAN */}
          <div>
            <Label className="text-xs font-semibold">Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="founder">🏅 Founder</SelectItem>
                <SelectItem value="subscription">⭐ Suscripción</SelectItem>
                <SelectItem value="admin">🛡 Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ROL */}
          <div>
            <Label className="text-xs font-semibold">Rol</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">👤 Usuario</SelectItem>
                <SelectItem value="admin">🛡 Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ACCESO */}
          <label className="flex items-center gap-2 cursor-pointer p-2 bg-muted rounded">
            <Checkbox checked={hasAccess} onCheckedChange={setHasAccess} />
            <span className="text-sm font-medium">{hasAccess ? '✅' : '🔒'} Acceso a plataforma</span>
          </label>

          {/* FEATURES */}
          <div>
            <Label className="text-xs font-semibold mb-2 block">Features</Label>
            <div className="space-y-2">
              {[
                { key: 'luna', label: '🌙 Luna' },
                { key: 'automatizaciones', label: '⚡ Automatizaciones' },
                { key: 'nuevas_funciones', label: '✨ Nuevas Funciones' }
              ].map(f => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={features[f.key]}
                    onCheckedChange={checked => setFeatures({ ...features, [f.key]: checked })}
                  />
                  <span className="text-sm">{f.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => {
            onSave({
              plan,
              role,
              has_access: hasAccess,
              luna_access: features.luna,
              automatizaciones_access: features.automatizaciones,
              nuevas_funciones_access: features.nuevas_funciones
            })
          }}>
            Guardar Cambios
          </Button>
        </div>
      </Card>
    </div>
  )
}
