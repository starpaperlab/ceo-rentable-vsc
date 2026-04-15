import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Eye, ArrowRight, FileText, MessageCircle } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';

const INVOICE_STATUS = {
  pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  paid: { label: 'Pagada', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

const QUOTE_STATUS = {
  pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  approved: { label: 'Aprobada', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: 'Rechazada', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function buildWhatsAppLink(doc) {
  const phone = (doc.client_phone || '').replace(/\D/g, '');
  if (!phone) return null;
  const statusLabel = doc.status === 'paid' ? 'pagada ✅' : doc.status === 'overdue' ? 'vencida ⚠️' : 'pendiente de pago ⏳';
  const number = doc.invoice_number || doc.quote_number || '';
  const total = doc.total_final ? `$${Number(doc.total_final).toLocaleString()}` : '';
  const msg = `Hola ${doc.client_name || 'cliente'}, te escribimos sobre tu documento ${number}${total ? ` por un monto de ${total}` : ''}. Estado: ${statusLabel}. ¿Podemos ayudarte con algo?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export default function DocumentList({ documents, type, onEdit, onDelete, onPreview, onConvert }) {
  const { formatMoney } = useCurrency();
  const statusMap = type === 'invoice' ? INVOICE_STATUS : QUOTE_STATUS;
  const numberField = type === 'invoice' ? 'invoice_number' : 'quote_number';
  const emptyLabel = type === 'invoice' ? 'facturas' : 'cotizaciones';

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs">Número</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Fecha</TableHead>
              <TableHead className="text-xs">Total</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No hay {emptyLabel} aún</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Crea tu primera {type === 'invoice' ? 'factura' : 'cotización'}</p>
                </TableCell>
              </TableRow>
            ) : (
              documents.map(doc => {
                const st = statusMap[doc.status] || statusMap.pending;
                return (
                  <TableRow key={doc.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-sm font-semibold text-foreground">{doc[numberField]}</TableCell>
                    <TableCell className="text-sm max-w-[120px] truncate">{doc.client_name || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{doc.date || '-'}</TableCell>
                    <TableCell className="font-bold text-primary">{formatMoney(doc.total_final || 0)}</TableCell>
                    <TableCell>
                      <Badge className={`${st.cls} border-0 text-xs`}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPreview(doc)} title="Vista previa">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(doc)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {type === 'quote' && onConvert && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" title="Convertir a Factura" onClick={() => onConvert(doc)}>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(() => { const waLink = buildWhatsAppLink(doc); return waLink ? (
                          <a href={waLink} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" title="Enviar recordatorio por WhatsApp">
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        ) : null; })()}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(doc.id)} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}