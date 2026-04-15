import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, Lock, Unlock, Loader2, CalendarCheck, TrendingUp, TrendingDown } from 'lucide-react';
import PageTour from '@/components/shared/PageTour';
import { useAuth } from '@/lib/AuthContext';
import { fetchOwnedRows, hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership';

const TOUR_STEPS = [
  { title: 'Control Mensual 📅', description: 'Registra tus ingresos y gastos cada mes. Es el hábito más importante para saber si tu negocio es realmente rentable.' },
  { title: 'Registra cada mes 📝', description: 'Haz clic en "Nuevo Mes", ingresa el total de lo que entraste y lo que gastaste. El sistema calcula tu beneficio y margen automáticamente.' },
  { title: 'Cierra el mes 🔒', description: 'Una vez revisado, cierra el mes para proteger los datos. Un mes cerrado no puede ser modificado accidentalmente.' },
  { title: 'Comparativa mensual 📊', description: 'El gráfico de barras muestra ingresos vs gastos de los últimos 6 meses. Úsalo para detectar meses malos y tomar acción.' },
];
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function MonthlyControl() {
  const { formatMoney } = useCurrency();
  const { user, userProfile, isAdmin } = useAuth();
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;
  const ownerId = user?.id || userProfile?.id || null;
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ month: '', income: 0, expenses: 0, notes: '' });
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['monthly-records', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({
      table: 'monthly_records',
      ownerId,
      ownerEmail,
      adminMode,
      orderBy: 'month',
      ascending: false,
    }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (!adminMode && !ownerId && !ownerEmail) {
        throw new Error('Tu sesión no está lista. Recarga la página e intenta de nuevo.');
      }

      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de guardar control mensual:', profileError?.message || profileError);
        }
      }

      const payload = {
        ...data,
        profit: (data.income || 0) - (data.expenses || 0),
        margin_pct: data.income > 0 ? (((data.income - data.expenses) / data.income) * 100) : 0,
        user_id: ownerId,
        created_by: ownerEmail,
        created_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('monthly_records').insert(payload);
      if (error && (
        isMissingColumnError(error, 'monthly_records.user_id') ||
        isMissingColumnError(error, 'user_id') ||
        isMissingColumnError(error, 'monthly_records.created_by') ||
        isMissingColumnError(error, 'created_by')
      )) {
        const legacyPayload = { ...payload };
        delete legacyPayload.user_id;
        delete legacyPayload.created_by;
        const { error: retryError } = await supabase.from('monthly_records').insert(legacyPayload);
        if (retryError) throw retryError;
        return;
      }
      if (error && hasOwnerConstraintIssue(error, 'monthly_records')) {
        const legacyPayload = { ...payload };
        delete legacyPayload.user_id;
        const { error: retryError } = await supabase.from('monthly_records').insert(legacyPayload);
        if (retryError) throw retryError;
        return;
      }
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-records'] });
      setShowForm(false);
      setForm({ month: '', income: 0, expenses: 0, notes: '' });
      toast.success('Mes registrado');
    },
    onError: (error) => {
      toast.error(`No se pudo registrar el mes: ${error.message}`);
    },
  });

  const toggleClose = useMutation({
    mutationFn: async ({ id, isClosed }) => {
      const { error } = await supabase
        .from('monthly_records')
        .update({ is_closed: !isClosed })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-records'] });
    },
    onError: (error) => {
      toast.error(`No se pudo cambiar el estado del mes: ${error.message}`);
    },
  });

  const sorted = [...records].sort((a, b) => (b.month || '').localeCompare(a.month || ''));
  const chartData = [...records].sort((a, b) => (a.month || '').localeCompare(b.month || '')).slice(-6).map(r => ({
    month: r.month?.slice(5) || '',
    ingresos: r.income || 0,
    gastos: r.expenses || 0,
  }));

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <PageTour pageName="MonthlyControl" userEmail={ownerEmail} steps={TOUR_STEPS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Control Mensual</h1>
          <p className="text-sm text-muted-foreground mt-1">Registra ingresos y gastos mes a mes.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo Mes
        </Button>
      </motion.div>

      {/* New month form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-6 space-y-4">
              <h3 className="text-sm font-semibold">Registrar Mes</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Mes (YYYY-MM)</Label>
                  <Input placeholder="2025-01" value={form.month} onChange={e => setForm(prev => ({ ...prev, month: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Ingresos</Label>
                  <Input type="number" value={form.income || ''} onChange={e => setForm(prev => ({ ...prev, income: parseFloat(e.target.value) || 0 }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Gastos</Label>
                  <Input type="number" value={form.expenses || ''} onChange={e => setForm(prev => ({ ...prev, expenses: parseFloat(e.target.value) || 0 }))} className="mt-1" />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button className="bg-primary text-primary-foreground" onClick={() => createMutation.mutate(form)} disabled={!form.month || createMutation.isPending}>
                  Guardar
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Comparativa Mensual</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
                formatter={(v) => [formatMoney(v)]}
              />
              <Bar dataKey="ingresos" fill="hsl(336, 60%, 58%)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="gastos" fill="hsl(275, 52%, 64%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Records Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Mes</TableHead>
                <TableHead>Ingresos</TableHead>
                <TableHead>Gastos</TableHead>
                <TableHead>Beneficio</TableHead>
                <TableHead>Margen</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <CalendarCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Sin registros mensuales</p>
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map(r => {
                  const profit = (r.income || 0) - (r.expenses || 0);
                  const margin = r.income > 0 ? ((profit / r.income) * 100) : 0;
                  return (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{r.month}</TableCell>
                      <TableCell className="text-green-600 font-medium">{formatMoney(r.income || 0)}</TableCell>
                      <TableCell className="text-red-500 font-medium">{formatMoney(r.expenses || 0)}</TableCell>
                      <TableCell className="font-bold">{formatMoney(profit)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {margin >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-green-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                          <span className={`text-sm font-medium ${margin >= 30 ? 'text-green-600' : margin >= 15 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {margin.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-xs gap-1.5"
                          onClick={() => toggleClose.mutate({ id: r.id, isClosed: r.is_closed })}
                        >
                          {r.is_closed ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                          {r.is_closed ? 'Cerrado' : 'Abierto'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
