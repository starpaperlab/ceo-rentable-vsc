import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Filter, Loader2, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { listCostLibraryItems } from '@/lib/costLibrary';
import { calculateLibraryItemUnitCost, normalizeCostLibraryItem } from '@/lib/costLibraryTypes';

const CATEGORY_LABELS = {
  material: 'Material',
  empaque: 'Empaque',
  herramienta_plataforma: 'Herramienta o plataforma',
  proceso_mano_obra: 'Proceso o mano de obra',
  soporte: 'Soporte',
  onboarding_entrega: 'Onboarding o entrega',
  subcontrato: 'Subcontrato',
  traslado: 'Traslado',
  gasto_operativo: 'Gasto operativo',
  comision_impuesto: 'Comisión o impuesto',
  publicidad_captacion: 'Publicidad o captación',
  otro: 'Otro',
};

const CALCULATION_LABELS = {
  fixed: 'Importe fijo',
  per_unit: 'Por unidad',
  hourly: 'Por hora',
  percentage: 'Porcentaje sobre venta',
  monthly_prorated: 'Mensual prorrateado',
  annual_prorated: 'Anual prorrateado',
};

function referenceText(item, formatMoney) {
  const normalized = normalizeCostLibraryItem(item);
  const result = calculateLibraryItemUnitCost(normalized, { quantity: 1, hours: 1, salePrice: 100 });
  const amount = formatMoney(result.computedAmount || 0);
  if (normalized.calculationType === 'per_unit') return `${amount} por ${normalized.usageUnit || 'unidad'}`;
  if (normalized.calculationType === 'hourly') return `${amount} por hora`;
  if (normalized.calculationType === 'percentage') {
    return `${normalized.percentageRate || 0}%${normalized.fixedFee > 0 ? ` + ${formatMoney(normalized.fixedFee)} fijo` : ''}`;
  }
  return amount;
}

export default function CostLibraryViewer() {
  const { formatMoney } = useCurrency();
  const { activeWorkspaceId } = useWorkspace();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');

  const { data: items = [], isLoading, isError, error } = useQuery({
    queryKey: ['cost-library-viewer', activeWorkspaceId],
    queryFn: () => listCostLibraryItems({ orderBy: 'name', ascending: true }),
    enabled: Boolean(activeWorkspaceId),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (status === 'active' && !item.isActive) return false;
      if (status === 'inactive' && item.isActive) return false;
      if (!q) return true;
      return `${item.name || ''} ${item.provider || ''}`.toLowerCase().includes(q);
    });
  }, [category, items, search, status]);

  const summary = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.isActive).length,
    categories: new Set(items.map((item) => item.category).filter(Boolean)).size,
  }), [items]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:py-6 lg:px-6">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Biblioteca de Costos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Consulta materiales, herramientas, comisiones y otros costos registrados por tu negocio.</p>
        </div>

        <Card className="border-dashed bg-muted/20 p-4">
          <div className="flex items-start gap-3">
            <Eye className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Modo solo lectura</p>
              <p className="mt-1 text-xs text-muted-foreground">Puedes consultar costos, referencias, categorías y proveedores, pero no crear, editar, duplicar, activar, desactivar ni eliminar registros.</p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[['Total de costos', summary.total], ['Activos', summary.active], ['Categorías', summary.categories]].map(([label, value]) => (
            <Card key={label} className="p-3 shadow-sm">
              <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{isLoading ? '—' : value}</p>
            </Card>
          ))}
        </div>

        <Card className="p-3 shadow-sm sm:p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_180px]">
            <div className="space-y-2">
              <Label htmlFor="viewer-cost-search">Búsqueda</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="viewer-cost-search" className="min-h-11 pl-9" placeholder="Buscar por nombre o proveedor" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="inactive">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="flex min-h-[240px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : isError ? (
          <Card className="p-5"><p className="text-sm font-semibold">No se pudo cargar la biblioteca.</p><p className="mt-1 text-xs text-muted-foreground">{error?.message}</p></Card>
        ) : filtered.length === 0 ? (
          <Card className="p-6 text-center"><Filter className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-3 text-sm text-muted-foreground">No hay costos que coincidan con los filtros.</p></Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <Card key={item.id} className="p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      <Badge variant="outline">{item.isActive ? 'Activo' : 'Inactivo'}</Badge>
                    </div>
                    {item.provider ? <p className="mt-1 text-sm text-muted-foreground">Proveedor: {item.provider}</p> : null}
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                      <p><span className="font-medium text-foreground">Categoría:</span> {CATEGORY_LABELS[item.category] || item.category || '—'}</p>
                      <p><span className="font-medium text-foreground">Cálculo:</span> {CALCULATION_LABELS[item.calculationType] || item.calculationType || '—'}</p>
                      <p><span className="font-medium text-foreground">Referencia:</span> {referenceText(item, formatMoney)}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
