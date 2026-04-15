import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function PreviewModal({ document: doc, type, onClose }) {
  const { symbol } = useCurrency();
  const previewRef = useRef(null);

  const docNumber = type === 'invoice' ? doc.invoice_number : doc.quote_number;
  const docLabel = type === 'invoice' ? 'FACTURA' : 'COTIZACIÓN';
  const brandColor = doc.brand_color || '#D94F8A';
  const fontFamily = doc.font_family || 'Inter';
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;600;700&display=swap`;

  const taxAmount = doc.tax_enabled ? (doc.subtotal || 0) * ((doc.tax_pct || 0) / 100) : 0;
  const totalFinal = (doc.subtotal || 0) + taxAmount;
  const validItems = (doc.line_items || []).filter(i => i.description);

  const handleExportPDF = async () => {
    if (!previewRef.current) return;
    const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
    pdf.save(`${docLabel}-${docNumber}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mt-4 mb-8">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-sm">Vista Previa del Documento</h3>
          <div className="flex gap-2">
            <Button onClick={handleExportPDF} size="sm" className="bg-white text-foreground hover:bg-white/90 text-xs">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Exportar PDF
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10 h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Document */}
        <div ref={previewRef} style={{ fontFamily: `'${fontFamily}', Arial, sans-serif`, backgroundColor: '#ffffff', padding: '40px', borderRadius: '12px' }}>
          <link rel="stylesheet" href={fontUrl} />
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
            <div>
              {doc.logo_url && (
                <img src={doc.logo_url} alt="Logo" style={{ height: '56px', objectFit: 'contain', marginBottom: '8px' }} crossOrigin="anonymous" />
              )}
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: brandColor, margin: 0 }}>
                {doc.company_name || 'Mi Empresa'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: brandColor, margin: '0 0 4px 0' }}>{docLabel}</p>
              <p style={{ fontSize: '13px', color: '#666', margin: '0 0 2px 0' }}>N° {docNumber}</p>
              <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>Fecha: {doc.date}</p>
            </div>
          </div>

          {/* Client */}
          <div style={{ backgroundColor: `${brandColor}15`, borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <p style={{ fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px 0' }}>Facturado a</p>
            <p style={{ fontSize: '15px', fontWeight: 'bold', color: '#222', margin: '0 0 4px 0' }}>{doc.client_name || '-'}</p>
            {doc.client_email && <p style={{ fontSize: '13px', color: '#666', margin: '0 0 2px 0' }}>{doc.client_email}</p>}
            {doc.client_phone && <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>📞 {doc.client_phone}</p>}
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <thead>
              <tr style={{ backgroundColor: brandColor }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#fff', fontSize: '11px', fontWeight: '600' }}>Descripción</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: '#fff', fontSize: '11px', fontWeight: '600' }}>Precio</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: '#fff', fontSize: '11px', fontWeight: '600' }}>Cant.</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: '#fff', fontSize: '11px', fontWeight: '600' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {validItems.map((item, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#f8f8f8' : '#ffffff' }}>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: '#333' }}>{item.description}</td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: '#555', textAlign: 'right' }}>
                    {symbol}{(parseFloat(item.unit_price) || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: '#555', textAlign: 'right' }}>{item.quantity}</td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', color: '#222', textAlign: 'right' }}>
                    {symbol}{((parseFloat(item.unit_price) || 0) * (parseFloat(item.quantity) || 0)).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '240px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#666' }}>
                <span>Subtotal</span>
                <span>{symbol}{(doc.subtotal || 0).toLocaleString()}</span>
              </div>
              {doc.tax_enabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#666' }}>
                  <span>ITBIS / IVA ({doc.tax_pct}%)</span>
                  <span>{symbol}{taxAmount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginTop: '8px', backgroundColor: brandColor, borderRadius: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>TOTAL</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>{symbol}{totalFinal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
            <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
              {doc.notes || (type === 'quote' ? 'Esta cotización es válida por 30 días.' : '')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}