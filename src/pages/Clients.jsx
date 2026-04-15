import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/components/shared/CurrencyContext';
import ClientTable from '@/components/clients/ClientTable';
import ClientForm from '@/components/clients/ClientForm';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Loader2 } from 'lucide-react';
import PageTour from '@/components/shared/PageTour';
import { useAuth } from '@/lib/AuthContext';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { fetchOwnedRows, hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership';

const TOUR_STEPS = [
  { title: 'Gestión de Clientes 👥', description: 'Tu base de clientes es uno de tus activos más valiosos. Aquí registras cada cliente, cuánto te ha comprado y su categoría.' },
  { title: 'Ticket promedio 💰', description: 'El ticket promedio te dice cuánto gasta un cliente en promedio. Entre más alto, mejor. Trabaja para subir este número con upsells.' },
  { title: 'Clientes VIP ⭐', description: 'Clasifica tus mejores clientes como VIP. Son los que más ingresos te generan y a quienes debes dar prioridad y atención especial.' },
];
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

function normalizeClientPayload(raw = {}) {
  return {
    name: (raw.name || '').trim(),
    email: (raw.email || '').trim() || null,
    phone: (raw.phone || '').trim() || null,
    status: raw.status || 'new',
    total_billed: Number(raw.total_billed || 0),
    notes: (raw.notes || '').trim() || null,
  };
}

function sortByCreatedDesc(rows = []) {
  return [...rows].sort((a, b) => {
    const aDate = new Date(a.created_at || a.created_date || 0).getTime();
    const bDate = new Date(b.created_at || b.created_date || 0).getTime();
    return bDate - aDate;
  });
}

export default function Clients() {
  const { formatMoney } = useCurrency();
  const { user, userProfile, isAdmin } = useAuth();
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const ownerId = user?.id || userProfile?.id || null;

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', ownerId, ownerEmail, adminMode],
    queryFn: async () => {
      const rows = await fetchOwnedRows({
        table: 'clients',
        ownerId,
        ownerEmail,
        adminMode,
        orderBy: 'created_at',
        ascending: false,
      });
      return sortByCreatedDesc(rows);
    },
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de crear cliente:', profileError?.message || profileError);
        }
      }

      const now = new Date().toISOString();
      const basePayload = normalizeClientPayload(data);
      let payload = {
        ...basePayload,
        user_id: ownerId,
        created_by: ownerEmail || null,
        created_at: now,
        created_date: now,
      };

      const tryInsert = async (candidate) => {
        const { error } = await supabase.from('clients').insert(candidate);
        if (!error) return;

        if (isMissingColumnError(error, 'clients.user_id') || isMissingColumnError(error, 'user_id')) {
          const next = { ...candidate };
          delete next.user_id;
          return tryInsert(next);
        }
        if (isMissingColumnError(error, 'clients.created_by') || isMissingColumnError(error, 'created_by')) {
          const next = { ...candidate };
          delete next.created_by;
          return tryInsert(next);
        }
        if (isMissingColumnError(error, 'clients.created_date') || isMissingColumnError(error, 'created_date')) {
          const next = { ...candidate };
          delete next.created_date;
          return tryInsert(next);
        }
        if (isMissingColumnError(error, 'clients.created_at') || isMissingColumnError(error, 'created_at')) {
          const next = { ...candidate };
          delete next.created_at;
          return tryInsert(next);
        }
        if (hasOwnerConstraintIssue(error, 'clients')) {
          const next = { ...candidate };
          delete next.user_id;
          return tryInsert(next);
        }

        throw error;
      };

      await tryInsert(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setShowForm(false);
      toast.success('Cliente creado');
    },
    onError: (error) => {
      toast.error(`No se pudo crear el cliente: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const payload = normalizeClientPayload(data);
      const { error } = await supabase.from('clients').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setShowForm(false);
      setEditingClient(null);
      toast.success('Cliente actualizado');
    },
    onError: (error) => {
      toast.error(`No se pudo actualizar el cliente: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente eliminado');
    },
    onError: (error) => {
      toast.error(`No se pudo eliminar el cliente: ${error.message}`);
    },
  });

  const handleSubmit = (data) => {
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setShowForm(true);
  };

  const filtered = clients.filter(c => {
    const matchSearch = c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalBilled = clients.reduce((s, c) => s + (c.total_billed || 0), 0);
  const avgTicket = clients.length > 0 ? totalBilled / clients.length : 0;
  const vipCount = clients.filter(c => c.status === 'vip').length;

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageTour pageName="Clients" userEmail={ownerEmail} steps={TOUR_STEPS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestiona tus clientes y aumenta tus ingresos. Tus clientes son la base de tu crecimiento.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => { setEditingClient(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo Cliente
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Clientes</p>
          <p className="text-2xl font-bold text-primary mt-1">{clients.length}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Ticket Prom.</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatMoney(avgTicket)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">VIP</p>
          <p className="text-2xl font-bold text-secondary mt-1">{vipCount}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="new">Nuevos</SelectItem>
            <SelectItem value="recurring">Recurrentes</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <ClientForm
            client={editingClient}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingClient(null); }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}
      </AnimatePresence>

      {/* Table */}
      <ClientTable clients={filtered} onEdit={handleEdit} onDelete={(id) => deleteMutation.mutate(id)} />
    </div>
  );
}
