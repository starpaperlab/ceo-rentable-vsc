import React from 'react';
import { BriefcaseBusiness, Loader2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WORK_VIEW_MODES, useWorkContext } from '@/contexts/WorkContext';

const NO_BRAND_VALUE = '__no_brand__';

const VIEW_LABELS = {
  [WORK_VIEW_MODES.OWN_RECORDS]: 'Solo mis registros',
  [WORK_VIEW_MODES.ALL_USERS]: 'Todos los usuarios',
  [WORK_VIEW_MODES.SPECIFIC_USER]: 'Usuario específico',
};

function formatUserLabel(user) {
  if (!user) return 'Seleccionar usuario';
  return user.full_name || user.email || 'Usuario';
}

export default function WorkContextSelector() {
  const {
    activeBrand,
    activeBrandId,
    activeUser,
    activeUserId,
    activeView,
    brands,
    error,
    isAdminUser,
    isLoading,
    setActiveBrandId,
    setActiveUserId,
    setActiveView,
    users,
  } = useWorkContext();

  const brandLabel = activeBrand?.name || (isAdminUser ? 'Todas mis marcas' : 'Sin marca asignada');
  const viewLabel = isAdminUser ? VIEW_LABELS[activeView] || VIEW_LABELS[WORK_VIEW_MODES.OWN_RECORDS] : 'Mis registros';
  const userLabel = activeView === WORK_VIEW_MODES.SPECIFIC_USER ? formatUserLabel(activeUser) : viewLabel;
  const brandSelectValue = activeBrandId || NO_BRAND_VALUE;
  const userSelectValue = activeUserId || NO_BRAND_VALUE;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 max-w-[44vw] sm:max-w-sm justify-start gap-2 px-2.5 text-left"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <BriefcaseBusiness className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0">
            <span className="block text-[10px] leading-3 text-muted-foreground">Trabajando en</span>
            <span className="block max-w-[28vw] truncate text-xs font-semibold sm:max-w-[15rem]">
              {brandLabel}
            </span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-4">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold">Contexto de trabajo</p>
            <p className="text-xs text-muted-foreground">
              Esta selección queda preparada para filtrar por marca en la próxima fase.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Marca activa</Label>
            <Select
              value={brandSelectValue}
              onValueChange={(value) => setActiveBrandId(value === NO_BRAND_VALUE ? null : value)}
              disabled={isLoading}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isAdminUser ? (
                  <SelectItem value={NO_BRAND_VALUE}>Todas mis marcas</SelectItem>
                ) : null}
                {!isAdminUser && !activeBrandId ? (
                  <SelectItem value={NO_BRAND_VALUE} disabled={brands.length > 0}>
                    {brands.length > 0 ? 'Selecciona una marca' : 'Sin marcas asignadas'}
                  </SelectItem>
                ) : null}
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name || 'Marca sin nombre'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Vista activa</Label>
            {isAdminUser ? (
              <Select value={activeView} onValueChange={setActiveView}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WORK_VIEW_MODES.OWN_RECORDS}>Solo mis registros</SelectItem>
                  <SelectItem value={WORK_VIEW_MODES.ALL_USERS}>Todos los usuarios</SelectItem>
                  <SelectItem value={WORK_VIEW_MODES.SPECIFIC_USER}>Usuario específico</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm">
                <UsersRound className="h-4 w-4 text-muted-foreground" />
                Mis registros
              </div>
            )}
          </div>

          {isAdminUser && activeView === WORK_VIEW_MODES.SPECIFIC_USER ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Usuario</Label>
              <Select
                value={userSelectValue}
                onValueChange={(value) => setActiveUserId(value === NO_BRAND_VALUE ? null : value)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BRAND_VALUE}>Seleccionar usuario</SelectItem>
                  {users.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {formatUserLabel(row)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="rounded-md border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Vista actual</p>
            <p className="mt-0.5 truncate">{brandLabel} · {userLabel}</p>
            {error ? (
              <p className="mt-1 text-red-600">
                No se pudieron cargar marcas. Revisa la migración de contexto.
              </p>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
