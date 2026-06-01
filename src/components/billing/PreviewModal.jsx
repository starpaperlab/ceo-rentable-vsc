import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { generateBillingDocumentPdf } from '@/lib/documentPdf';

export default function PreviewModal({ document: doc, type, onClose }) {
  const { symbol } = useCurrency();
  const previewRef = useRef(null);

  const docNumber = type === 'invoice' ? doc.invoice_number : doc.quote_number;
  const docLabel = type === 'invoice' ? 'FACTURA' : 'COTIZACIÓN';
  const recipientLabel = type === 'invoice' ? 'FACTURADO A' : 'COTIZADO PARA';
  const brandColor = doc.brand_color || '#D94F8A';
  const fontFamily = doc.font_family || 'Inter';
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;600;700&display=swap`;

  const additionalCharges = (doc.additional_charges || []).filter((charge) => charge.name && Number(charge.amount || 0) > 0);
  const additionalChargesTotal = Number(doc.additional_charges_total ?? additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0));
  const subtotalBeforeTax = Number(doc.subtotal_before_tax ?? ((doc.subtotal || 0) + additionalChargesTotal));
  const taxAmount = doc.tax_enabled ? subtotalBeforeTax * ((doc.tax_pct || 0) / 100) : 0;
  const totalFinal = Number(doc.total_final ?? subtotalBeforeTax + taxAmount);
  const validItems = (doc.line_items || []).filter(i => i.description);
  const logoWidth = Number(doc.logo_width || 24);
  const logoPosition = doc.logo_position || 'left';
  const logoAlign = logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'flex-end' : 'flex-start';
  const textAlign = logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'right' : 'left';
  const companyDetails = [
    doc.doc_show_fiscal_id !== false && doc.fiscal_id ? `RNC / ID: ${doc.fiscal_id}` : '',
    doc.doc_show_address !== false && (doc.address || doc.fiscal_address) ? (doc.address || doc.fiscal_address) : '',
    doc.doc_show_address !== false && doc.city_country ? doc.city_country : '',
  ].filter(Boolean);
  const contactDetails = [
    doc.doc_show_contact !== false && doc.contact_name ? [doc.contact_name, doc.contact_title].filter(Boolean).join(' · ') : '',
    doc.doc_show_contact !== false && doc.contact_email ? doc.contact_email : '',
    doc.doc_show_contact !== false && doc.phone_primary ? doc.phone_primary : '',
    doc.doc_show_contact !== false && doc.phone_secondary ? doc.phone_secondary : '',
  ].filter(Boolean);
  const socialDetails = [
    doc.website_url,
    doc.instagram_url,
    doc.facebook_url,
    doc.tiktok_url,
    doc.linkedin_url,
    doc.whatsapp_url,
  ].filter(Boolean);
  const signerName = doc.contact_name || doc.company_name || 'Firma autorizada';
  const signerMeta = [doc.contact_title, doc.contact_email].filter(Boolean).join(' · ');

  const handleExportPDF = async () => {
    await generateBillingDocumentPdf({ doc, type, symbol });
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', marginBottom: '32px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: logoAlign, textAlign }}>
              {doc.logo_url && (
                <img
                  src={doc.logo_url}
                  alt="Logo"
                  style={{
                    width: `${logoWidth * 3.6}px`,
                    maxHeight: '86px',
                    height: 'auto',
                    objectFit: 'contain',
                    marginBottom: '8px',
                  }}
                  crossOrigin="anonymous"
                />
              )}
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: brandColor, margin: 0 }}>
                {doc.company_name || 'Mi Empresa'}
              </p>
              {doc.fiscal_name && doc.fiscal_name !== doc.company_name && (
                <p style={{ fontSize: '12px', color: '#666', margin: '3px 0 0 0' }}>{doc.fiscal_name}</p>
              )}
              {companyDetails.map((detail) => (
                <p key={detail} style={{ fontSize: '11px', color: '#777', margin: '2px 0 0 0' }}>{detail}</p>
              ))}
              {contactDetails.length > 0 && (
                <p style={{ fontSize: '11px', color: '#777', margin: '6px 0 0 0' }}>{contactDetails.join(' · ')}</p>
              )}
            </div>
            <div style={{ textAlign: 'right', minWidth: '150px' }}>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: brandColor, margin: '0 0 4px 0' }}>{docLabel}</p>
              <p style={{ fontSize: '13px', color: '#666', margin: '0 0 2px 0' }}>N° {docNumber}</p>
              <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>Fecha: {doc.date}</p>
            </div>
          </div>

          {/* Client */}
          <div style={{ backgroundColor: `${brandColor}12`, borderRadius: '10px', padding: '16px', marginBottom: '24px', border: `1px solid ${brandColor}26` }}>
            <p style={{ fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px 0' }}>{recipientLabel}</p>
            <p style={{ fontSize: '15px', fontWeight: 'bold', color: '#222', margin: '0 0 4px 0' }}>{doc.client_name || '-'}</p>
            {doc.client_email && <p style={{ fontSize: '13px', color: '#666', margin: '0 0 2px 0' }}>{doc.client_email}</p>}
            {doc.client_phone && <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>📞 {doc.client_phone}</p>}
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, marginBottom: '24px' }}>
            <thead>
              <tr style={{ backgroundColor: `${brandColor}14` }}>
                <th style={{ textAlign: 'left', padding: '11px 12px', color: brandColor, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', borderTopLeftRadius: '10px', borderBottom: `1px solid ${brandColor}25` }}>Descripción</th>
                <th style={{ textAlign: 'right', padding: '11px 12px', color: brandColor, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', borderBottom: `1px solid ${brandColor}25` }}>Precio</th>
                <th style={{ textAlign: 'right', padding: '11px 12px', color: brandColor, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', borderBottom: `1px solid ${brandColor}25` }}>Cant.</th>
                <th style={{ textAlign: 'right', padding: '11px 12px', color: brandColor, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', borderTopRightRadius: '10px', borderBottom: `1px solid ${brandColor}25` }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {validItems.map((item, i) => (
                <tr key={i} style={{ backgroundColor: '#ffffff' }}>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#333', borderBottom: '1px solid #ece7e2' }}>{item.description}</td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#555', textAlign: 'right', borderBottom: '1px solid #ece7e2' }}>
                    {symbol}{(parseFloat(item.unit_price) || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#555', textAlign: 'right', borderBottom: '1px solid #ece7e2' }}>{item.quantity}</td>
                  <td style={{ padding: '12px', fontSize: '13px', fontWeight: '700', color: '#222', textAlign: 'right', borderBottom: '1px solid #ece7e2' }}>
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
	                <span>Subtotal productos/servicios</span>
	                <span>{symbol}{(doc.subtotal || 0).toLocaleString()}</span>
	              </div>
	              {additionalCharges.map((charge, index) => (
	                <div key={`${charge.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#666' }}>
	                  <span>{charge.name}</span>
	                  <span>{symbol}{Number(charge.amount || 0).toLocaleString()}</span>
	                </div>
	              ))}
	              {additionalChargesTotal > 0 && (
	                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#333', fontWeight: '600' }}>
	                  <span>Subtotal antes de impuestos</span>
	                  <span>{symbol}{subtotalBeforeTax.toLocaleString()}</span>
	                </div>
	              )}
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
            {doc.doc_show_signature && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '28px' }}>
                <div style={{ borderTop: `1px solid ${brandColor}`, paddingTop: '6px', fontSize: '10px', color: '#777' }}>
                  <strong style={{ color: '#555' }}>{signerName}</strong>
                  {signerMeta && <span style={{ display: 'block', marginTop: '2px' }}>{signerMeta}</span>}
                </div>
                <div style={{ borderTop: `1px solid ${brandColor}`, paddingTop: '6px', fontSize: '10px', color: '#777' }}>Aceptado por cliente</div>
              </div>
            )}
            {doc.doc_show_socials !== false && socialDetails.length > 0 && (
              <p style={{ fontSize: '10px', color: '#999', margin: '18px 0 0 0', lineHeight: 1.5 }}>
                {socialDetails.join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
