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
import { mapBrandProfileToBusinessConfig, resolveDocumentBranding } from '@/lib/documentBranding';
import { enrichInvoicesWithPayments, getInvoicePaymentErrorMessage, groupPaymentsByInvoice } from '@/lib/invoicePayments';
import { deleteOwnedRowById, extractMissingColumnFromError, fetchOwnedRows, hasOwnerConstraintIssue, isMissingColumnError, updateOwnedRowById } from '@/lib/supabaseOwnership';

const TOUR_STEPS = [
  { title: 'Facturacion', description: 'Registra ventas con facturas y da seguimiento a cobros pendientes.' },
  { title: 'Facturas y Cotizaciones', description: 'Convierte cotizaciones aprobadas en facturas en un clic.' },
  { title: 'Vencidas', description: 'Identifica rapido facturas atrasadas y registra recordatorios.' },
];

function applyBusinessConfigToDocument(doc = {}, config = {}) {
  return resolveDocumentBranding(doc, config);
}

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

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
    const safePayload = { ...payload };

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const { data, error } = await supabase
          .from(table)
          .insert(safePayload)
          .select()
          .single();
        if (error) throw error;
        return data;
      } catch (error) {
        const missingColumn = extractMissingColumnFromError(error);
        if (missingColumn && Object.prototype.hasOwnProperty.call(safePayload, missingColumn)) {
          delete safePayload[missingColumn];
          continue;
        }

        if (
          isMissingColumnError(error, `${table}.user_id`) ||
          isMissingColumnError(error, 'user_id') ||
          isMissingColumnError(error, `${table}.created_by`) ||
          isMissingColumnError(error, 'created_by')
        ) {
          delete safePayload.user_id;
          delete safePayload.created_by;
          continue;
        }
        if (hasOwnerConstraintIssue(error, table)) {
          delete safePayload.user_id;
          continue;
        }
        throw error;
      }
    }

    throw new Error(`No se pudo insertar en ${table} porque Supabase sigue reportando columnas faltantes.`);
  };

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'invoices', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: invoicePayments = [] } = useQuery({
    queryKey: ['invoice-payments', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'invoice_payments', ownerId, ownerEmail, adminMode }),
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
  const { data: brandProfiles = [] } = useQuery({
    queryKey: ['brand-profiles', ownerId, ownerEmail],
    queryFn: () => fetchOwnedRows({
      table: 'brand_profiles',
      ownerId,
      ownerEmail,
      adminMode: false,
      orderBy: 'updated_at',
      ascending: false,
    }),
    enabled: adminMode && !!(ownerId || ownerEmail),
  });
  const ownConfig = useMemo(() => {
    const byUserId = configs.find((item) => ownerId && item.user_id === ownerId);
    if (byUserId) return byUserId;

    const byEmail = configs.find((item) => ownerEmail && normalizeEmail(item.created_by) === ownerEmail);
    if (byEmail) return byEmail;

    return adminMode ? null : configs[0] || null;
  }, [configs, ownerId, ownerEmail, adminMode]);

  const getConfigForDocument = (doc = null) => {
    if (!doc) return ownConfig;

    const docOwnerId = doc.user_id || null;
    const docOwnerEmail = normalizeEmail(doc.created_by);

    const byUserId = configs.find((item) => docOwnerId && item.user_id === docOwnerId);
    if (byUserId) return byUserId;

    const byEmail = configs.find((item) => docOwnerEmail && normalizeEmail(item.created_by) === docOwnerEmail);
    if (byEmail) return byEmail;

    return adminMode ? null : ownConfig;
  };

  const defaultAdminBrandProfile = useMemo(() => {
    if (!adminMode || brandProfiles.length === 0) return null;
    return brandProfiles.find((profile) => profile.is_default) || brandProfiles[0] || null;
  }, [adminMode, brandProfiles]);

  const newDocumentConfig = useMemo(() => {
    if (adminMode && defaultAdminBrandProfile) {
      return mapBrandProfileToBusinessConfig(defaultAdminBrandProfile, {
        ownerName: userProfile?.full_name || ownerEmail,
        ownerEmail,
      });
    }
    return ownConfig;
  }, [adminMode, defaultAdminBrandProfile, ownConfig, ownerEmail, userProfile?.full_name]);

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id) => {
      await deleteOwnedRowById({
        table: 'invoices',
        id,
        ownerId,
        ownerEmail,
        adminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Factura eliminada');
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id) => {
      await deleteOwnedRowById({
        table: 'quotes',
        id,
        ownerId,
        ownerEmail,
        adminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Cotizacion eliminada');
    },
  });

  const createInvoicePaymentMutation = useMutation({
    mutationFn: async ({ invoice, payload }) => {
      const paymentPayload = {
        ...payload,
        invoice_id: invoice.id,
        user_id: invoice.user_id || ownerId || null,
        created_by: normalizeEmail(invoice.created_by) || ownerEmail || null,
        registered_by: ownerId || null,
        registered_by_email: ownerEmail || null,
      };
      const { data, error } = await supabase
        .from('invoice_payments')
        .insert(paymentPayload)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Abono registrado');
    },
    onError: (error) => {
      toast.error(getInvoicePaymentErrorMessage(error));
    },
  });

  const updateInvoicePaymentMutation = useMutation({
    mutationFn: async ({ payment, payload }) => {
      await updateOwnedRowById({
        table: 'invoice_payments',
        id: payment.id,
        payload: {
          ...payload,
          registered_by: ownerId || null,
          registered_by_email: ownerEmail || null,
        },
        ownerId,
        ownerEmail,
        adminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Abono actualizado');
    },
    onError: (error) => {
      toast.error(getInvoicePaymentErrorMessage(error));
    },
  });

  const deleteInvoicePaymentMutation = useMutation({
    mutationFn: async (payment) => {
      await deleteOwnedRowById({
        table: 'invoice_payments',
        id: payment.id,
        ownerId,
        ownerEmail,
        adminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Abono eliminado');
    },
    onError: (error) => {
      toast.error(getInvoicePaymentErrorMessage(error));
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

      const {
        id: _id,
        quote_number: _quoteNumber,
        created_at: _createdAt,
        updated_at: _updatedAt,
        ...rest
      } = quote;
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

  const paymentsByInvoiceId = useMemo(() => groupPaymentsByInvoice(invoicePayments), [invoicePayments]);
  const invoicesWithPayments = useMemo(
    () => enrichInvoicesWithPayments(invoices, paymentsByInvoiceId),
    [invoices, paymentsByInvoiceId]
  );
  const sortedInvoices = useMemo(
    () => [...invoicesWithPayments].sort((a, b) => (b.created_at || b.date || '').localeCompare(a.created_at || a.date || '')),
    [invoicesWithPayments]
  );
  const sortedQuotes = useMemo(
    () => [...quotes].sort((a, b) => (b.created_at || b.date || '').localeCompare(a.created_at || a.date || '')),
    [quotes]
  );

  const isLoading = loadingInvoices || loadingQuotes;
  const totalBilledInvoices = invoicesWithPayments.reduce((sum, invoice) => sum + (invoice.payment_summary?.amountCollected || 0), 0);
  const totalReceivableBalance = invoicesWithPayments.reduce((sum, invoice) => sum + (invoice.payment_summary?.balanceDue || 0), 0);
  const pendingInvoices = invoicesWithPayments.filter((invoice) => (invoice.payment_summary?.balanceDue || 0) > 0).length;
  const partialInvoices = invoicesWithPayments.filter((invoice) => invoice.payment_summary?.paymentStatus === 'partial').length;
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
          key={`${editDoc.type}-${editDoc.doc?.id || 'new'}-${editDoc.doc?.brand_profile_id || defaultAdminBrandProfile?.id || 'default'}`}
          type={editDoc.type}
          doc={editDoc.doc}
          onSave={() => setEditDoc(null)}
          onCancel={() => setEditDoc(null)}
          clients={clients}
          products={products}
          inventoryItems={inventoryItems}
          config={editDoc.doc ? getConfigForDocument(editDoc.doc) : newDocumentConfig}
          brandProfiles={adminMode ? brandProfiles : []}
          ownerId={ownerId}
          ownerEmail={ownerEmail}
          ownerName={userProfile?.full_name || ownerEmail}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total cobrado</p>
          <p className="text-2xl font-bold text-primary mt-1">{formatMoney(totalBilledInvoices)}</p>
          <p className="text-xs text-muted-foreground mt-1">Abonos y facturas pagadas</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Facturas Pendientes</p>
          <p className="text-2xl font-bold text-foreground mt-1">{pendingInvoices}</p>
          <p className="text-xs text-muted-foreground mt-1">Pendientes por cobrar</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Pago parcial</p>
          <p className="text-2xl font-bold text-foreground mt-1">{partialInvoices}</p>
          <p className="text-xs text-muted-foreground mt-1">Facturas con abonos</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Saldo por cobrar</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatMoney(totalReceivableBalance)}</p>
          <p className="text-xs text-muted-foreground mt-1">{pendingQuotes} cotizaciones activas</p>
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
          <OverdueDashboard
            invoices={sortedInvoices}
            ownerId={ownerId}
            ownerEmail={ownerEmail}
            adminMode={adminMode}
          />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <DocumentList
            documents={sortedInvoices}
            type="invoice"
            onEdit={(doc) => setEditDoc({ type: 'invoice', doc })}
            onDelete={(id) => deleteInvoiceMutation.mutate(id)}
            onPreview={(doc) => setPreviewDoc({ ...applyBusinessConfigToDocument(doc, getConfigForDocument(doc)), _type: 'invoice' })}
          />
        </TabsContent>

        <TabsContent value="quotes" className="mt-4">
          <DocumentList
            documents={sortedQuotes}
            type="quote"
            onEdit={(doc) => setEditDoc({ type: 'quote', doc })}
            onDelete={(id) => deleteQuoteMutation.mutate(id)}
            onPreview={(doc) => setPreviewDoc({ ...applyBusinessConfigToDocument(doc, getConfigForDocument(doc)), _type: 'quote' })}
            onConvert={(quote) => convertToInvoiceMutation.mutate(quote)}
          />
        </TabsContent>
      </Tabs>

      {previewDoc && (
        <PreviewModal
          document={previewDoc}
          type={previewDoc._type || (previewDoc.invoice_number ? 'invoice' : 'quote')}
          onClose={() => setPreviewDoc(null)}
          payments={previewDoc._type === 'invoice' ? paymentsByInvoiceId[previewDoc.id] || [] : []}
          canManagePayments={previewDoc._type === 'invoice' && Boolean(previewDoc.id)}
          isSavingPayment={
            createInvoicePaymentMutation.isPending ||
            updateInvoicePaymentMutation.isPending ||
            deleteInvoicePaymentMutation.isPending
          }
          onCreatePayment={(payload) => createInvoicePaymentMutation.mutateAsync({ invoice: previewDoc, payload })}
          onUpdatePayment={(payment, payload) => updateInvoicePaymentMutation.mutateAsync({ payment, payload })}
          onDeletePayment={(payment) => deleteInvoicePaymentMutation.mutate(payment)}
        />
      )}
    </div>
  );
}
