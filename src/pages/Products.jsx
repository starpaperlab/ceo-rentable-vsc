import React, { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrency } from '@/components/shared/CurrencyContext'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Trash2, Loader2, Package } from 'lucide-react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/lib/AuthContext'
import PageTour from '@/components/shared/PageTour'
import { fetchOwnedRows } from '@/lib/supabaseOwnership'

const TOUR_STEPS = [
  { title: 'Catálogo de Productos 📦', description: 'Aquí vive tu base de datos de productos y servicios con precio, margen y estado.' },
  { title: 'Rentabilidad Visual 📊', description: 'La barra de rentabilidad te muestra rápidamente qué productos están fuertes y cuáles requieren ajuste.' },
  { title: 'Filtro rápido 🔎', description: 'Usa buscador y estado para encontrar productos clave y tomar decisiones más rápido.' },
]

export default function Products() {
  const { formatMoney } = useCurrency()
  const { user, userProfile, isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const adminMode = isAdmin?.() === true
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // 🚀 FETCH DESDE SUPABASE
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', user?.id, userProfile?.email, adminMode],
    queryFn: async () => {
      const ownerId = user?.id || userProfile?.id
      const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase()
      return fetchOwnedRows({
        table: 'products',
        ownerId,
        ownerEmail,
        adminMode,
        orderBy: 'created_at',
        ascending: false,
      })
    },
    enabled: adminMode || !!(user?.id || userProfile?.email),
  })

  // 🗑 DELETE
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Producto eliminado')
    }
  })

  // 🔎 FILTRO
  const getMarginColor = (margin) => {
    const m = Number(margin || 0)
    if (m >= 40) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (m >= 20) return 'bg-amber-100 text-amber-700 border-amber-200'
    if (m > 0) return 'bg-rose-100 text-rose-700 border-rose-200'
    return 'bg-muted text-muted-foreground border-border'
  }

  const getRentabilityBar = (margin) => {
    const m = Number(margin || 0)
    const width = Math.max(0, Math.min(100, (m / 60) * 100))
    if (m >= 40) return { width, fill: 'bg-emerald-500' }
    if (m >= 20) return { width, fill: 'bg-amber-500' }
    if (m > 0) return { width, fill: 'bg-rose-500' }
    return { width: 0, fill: 'bg-muted-foreground/30' }
  }

  const getTypeBadge = (type) => {
    const current = `${type || 'fisico'}`.toLowerCase()
    if (current === 'digital') return { label: '💻 Digital', cls: 'bg-sky-100 text-sky-700 border-sky-200' }
    if (current === 'servicio') return { label: '🛠 Servicio', cls: 'bg-violet-100 text-violet-700 border-violet-200' }
    return { label: '📦 Físico', cls: 'bg-stone-100 text-stone-700 border-stone-200' }
  }

  const statusLabels = {
    active: 'Activo',
    inactive: 'Inactivo',
    draft: 'Borrador',
    en_analisis: 'En análisis',
    analysis: 'En análisis',
    approved: 'Aprobado'
  }

  const statusColors = {
    active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    inactive: 'bg-muted text-muted-foreground border-border',
    draft: 'bg-amber-100 text-amber-700 border-amber-200',
    en_analisis: 'bg-rose-100 text-rose-700 border-rose-200',
    analysis: 'bg-rose-100 text-rose-700 border-rose-200',
    approved: 'bg-emerald-100 text-emerald-700 border-emerald-200'
  }

  const filtered = useMemo(() => products.filter((product) => {
    const searchValue = search.trim().toLowerCase()
    const name = (product.name || '').toLowerCase()
    const sku = (product.sku || '').toLowerCase()
    const matchesSearch = !searchValue || name.includes(searchValue) || sku.includes(searchValue)
    const currentStatus = product.status || 'draft'
    const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter
    return matchesSearch && matchesStatus
  }), [products, search, statusFilter])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1160px] mx-auto space-y-5">
      <PageTour pageName="Products" userEmail={ownerEmail} steps={TOUR_STEPS} />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-[34px] leading-[1.04] font-extrabold tracking-tight text-foreground">Catálogo de Productos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Base de datos editable de todos tus productos y servicios.
        </p>
      </motion.div>

      {/* FILTROS */}
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-11 rounded-xl"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-11 rounded-xl">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="en_analisis">En análisis</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* TABLA */}
      <Card className="overflow-hidden rounded-2xl border border-[#E7E1D9] shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/45">
              <TableRow className="border-b border-border">
                <TableHead className="text-xs font-bold text-muted-foreground">Producto</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Tipo</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Precio</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Margen</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Estado</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Rentabilidad</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Fecha</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-14">
                    <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No hay productos aún
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(p => (
                  <TableRow key={p.id} className="hover:bg-muted/20">

                    <TableCell className="font-semibold text-sm text-foreground">
                      {p.name}
                    </TableCell>

                    <TableCell>
                      <Badge className={`border font-semibold text-xs ${getTypeBadge(p.product_type).cls}`}>
                        {getTypeBadge(p.product_type).label}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-sm font-semibold text-foreground">
                      {formatMoney(p.sale_price || 0)}
                    </TableCell>

                    <TableCell>
                      <Badge className={`border text-xs font-bold ${getMarginColor(p.margin_pct)}`}>
                        {(p.margin_pct || 0).toFixed(1)}%
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge className={`border text-xs font-bold ${statusColors[p.status || 'draft']}`}>
                        {statusLabels[p.status || 'draft']}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {(() => {
                        const bar = getRentabilityBar(p.margin_pct)
                        return (
                          <div className="w-[84px] h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${bar.fill}`} style={{ width: `${bar.width}%` }} />
                          </div>
                        )
                      })()}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground font-medium">
                      {p.created_at
                        ? format(new Date(p.created_at), 'dd/MM/yy')
                        : '-'}
                    </TableCell>

                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => deleteMutation.mutate(p.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>

                  </TableRow>
                ))
              )}
            </TableBody>

          </Table>
        </div>
      </Card>

    </div>
  )
}
