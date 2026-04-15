import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Receipt, FileText, Loader2, AlertTriangle } from 'lucide-react';
import PageTour from '@/components/shared/PageTour';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import DocumentList from '@/components/billing/DocumentList';
import DocumentForm from '@/components/billing/DocumentForm';
import PreviewModal from '@/components/billing/PreviewModal';
import OverdueDashboard from '@/components/billing/OverdueDashboard';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { useAuth } from '@/lib/AuthContext';
import { fetchOwnedRows, hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership';

const TOUR_STEPS = [
  { title: 'Facturacion', description: 'Registra ventas con facturas y da seguimiento a cobros pendientes.' },
  { title: 'Facturas y Cotizaciones', description: 'Convierte cotizaciones aprobadas en facturas en un clic.' },
  { title: 'Vencidas', description: 'Identifica rapido facturas atrasadas y registra recordatorios.' },
];

export default function Billing() {
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();
  const { user, userProfile, isAdmin } = useAuth();
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;

  const [activeTab, setActiveTab] = useState('overdue');
  const [editDoc, setEditDoc] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const withOwner = (payload) => ({
    ...payload,
    user_id: ownerId,
    created_by: ownerEmail || null,
  });

  const safeInsert = async (table, payload) => {
    try {
      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      if (
        isMissingColumnError(error, `${table}.user_id`) ||
        isMissingColumnError(error, 'user_id') ||
        isMissingColumnError(error, `${table}.created_by`) ||
        isMissingColumnError(error, 'created_by')
      ) {
        const noUserId = { ...payload };
        delete noUserId.user_id;
        delete noUserId.created_by;
        const { data, error: retryError } = await supabase
          .from(table)
          .insert(noUserId)
          .select()
          .single();
        if (retryError) throw retryError;
        return data;
      }
      if (hasOwnerConstraintIssue(error, table)) {
        const noUserId = { ...payload };
        delete noUserId.user_id;
        const { data, error: retryError } = await supabase
          .from(table)
          .insert(noUserId)
          .select()
          .single();
        if (retryError) throw retryError;
        return data;
      }
      throw error;
    }
  };

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'invoices', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: quotes = [], isLoading: loadingQuotes } = useQuery({
    queryKey: ['quotes', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'quotes', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'clients', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'products', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-items', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'inventory_items', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['business-config', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'business_config', ownerId, ownerEmail, adminMode, orderBy: 'updated_at' }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });
  const config = configs[0] || null;

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Factura eliminada');
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Cotizacion eliminada');
    },
  });

  const convertToInvoiceMutation = useMutation({
    mutationFn: async (quote) => {
      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de convertir cotización:', profileError?.message || profileError);
        }
      }

      const { id, quote_number, created_at, updated_at, ...rest } = quote;
      const payload = withOwner({
        ...rest,
        invoice_number: `FAC-${String(invoices.length + 1).padStart(4, '0')}`,
        status: 'pending',
      });
      return safeInsert('invoices', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setActiveTab('invoices');
      toast.success('Cotizacion convertida a factura');
    },
    onError: (error) => {
      toast.error(`No se pudo convertir la cotización: ${error.message}`);
    },
  });

  const sortedInvoices = useMemo(
    () => [...invoices].sort((a, b) => (b.created_at || b.date || '').localeCompare(a.created_at || a.date || '')),
    [invoices]
  );
  const sortedQuotes = useMemo(
    () => [...quotes].sort((a, b) => (b.created_at || b.date || '').localeCompare(a.created_at || a.date || '')),
    [quotes]
  );

  const isLoading = loadingInvoices || loadingQuotes;
  const totalBilledInvoices = invoices.filter((invoice) => invoice.status === 'paid').reduce((sum, invoice) => sum + (invoice.total_final || 0), 0);
  const pendingInvoices = invoices.filter((invoice) => invoice.status === 'pending').length;
  const pendingQuotes = quotes.filter((quote) => quote.status === 'pending').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (editDoc) {
    return (
      <div className="p-4 lg:p-8 max-w-4xl mx-auto">
        <DocumentForm
          type={editDoc.type}
          doc={editDoc.doc}
          onSave={() => setEditDoc(null)}
          onCancel={() => setEditDoc(null)}
          clients={clients}
          products={products}
          inventoryItems={inventoryItems}
          config={config}
          ownerId={ownerId}
          ownerEmail={ownerEmail}
          adminMode={adminMode}
          totalCount={editDoc.type === 'invoice' ? invoices.length : quotes.length}
        />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageTour pageName="Billing" userEmail={ownerEmail} steps={TOUR_STEPS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Facturacion</h1>
          <p className="text-sm text-muted-foreground mt-1">Registra ventas y da seguimiento a cobros pendientes.</p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          onClick={() => setEditDoc({ type: activeTab === 'invoices' ? 'invoice' : 'quote', doc: null })}
        >
          <Plus className="h-4 w-4 mr-2" />
          {activeTab === 'invoices' ? 'Nueva Factura' : 'Nueva Cotizacion'}
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total cobrado</p>
          <p className="text-2xl font-bold text-primary mt-1">{formatMoney(totalBilledInvoices)}</p>
          <p className="text-xs text-muted-foreground mt-1">Facturas pagadas</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Facturas Pendientes</p>
          <p className="text-2xl font-bold text-foreground mt-1">{pendingInvoices}</p>
          <p className="text-xs text-muted-foreground mt-1">Pendientes por cobrar</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Cotizaciones Activas</p>
          <p className="text-2xl font-bold text-foreground mt-1">{pendingQuotes}</p>
          <p className="text-xs text-muted-foreground mt-1">Pendientes de aprobacion</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overdue" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Vencidas
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Facturas
          </TabsTrigger>
          <TabsTrigger value="quotes" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Cotizaciones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overdue" className="mt-4">
          <OverdueDashboard invoices={sortedInvoices} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <DocumentList
            documents={sortedInvoices}
            type="invoice"
            onEdit={(doc) => setEditDoc({ type: 'invoice', doc })}
            onDelete={(id) => deleteInvoiceMutation.mutate(id)}
            onPreview={(doc) => setPreviewDoc({ ...doc, _type: 'invoice' })}
          />
        </TabsContent>

        <TabsContent value="quotes" className="mt-4">
          <DocumentList
            documents={sortedQuotes}
            type="quote"
            onEdit={(doc) => setEditDoc({ type: 'quote', doc })}
            onDelete={(id) => deleteQuoteMutation.mutate(id)}
            onPreview={(doc) => setPreviewDoc({ ...doc, _type: 'quote' })}
            onConvert={(quote) => convertToInvoiceMutation.mutate(quote)}
          />
        </TabsContent>
      </Tabs>

      {previewDoc && (
        <PreviewModal
          document={previewDoc}
          type={previewDoc._type || (previewDoc.invoice_number ? 'invoice' : 'quote')}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}
