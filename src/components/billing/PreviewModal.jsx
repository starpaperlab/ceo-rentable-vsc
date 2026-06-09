import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { resolveDocumentBranding } from '@/lib/documentBranding';
import { generateBillingDocumentPdf } from '@/lib/documentPdf';
import {
  chunkCommercialAttachments,
  getCommercialAttachmentLayoutLabel,
  resolveVisualAttachmentsForDisplay,
  sanitizeCommercialAttachmentLayout,
  sanitizeVisualAttachments,
} from '@/lib/visualAttachments';

function AttachmentImage({ attachment, fallbackLabel, height }) {
  if (attachment.resolved_url) {
    return (
      <img
        src={attachment.resolved_url}
        alt={attachment.title || fallbackLabel}
        style={{
          width: '100%',
          height,
          objectFit: 'contain',
          borderRadius: '10px',
          backgroundColor: '#fff',
        }}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height,
        padding: '24px 18px',
        textAlign: 'center',
        fontSize: '12px',
        color: '#999',
        backgroundColor: '#fff',
        borderRadius: '10px',
      }}
    >
      No pudimos cargar este anexo para la vista previa.
    </div>
  );
}

function AttachmentCard({
  attachment,
  index,
  brandColor,
  compact = false,
}) {
  const imageHeight = compact ? '150px' : '340px';
  const titleSize = compact ? '13px' : '15px';
  const descriptionSize = compact ? '11px' : '12px';

  return (
    <div style={{ border: '1px solid #ece7e2', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fff' }}>
      <div style={{ padding: compact ? '12px' : '14px 16px', backgroundColor: `${brandColor}08`, borderBottom: `1px solid ${brandColor}18` }}>
        <AttachmentImage
          attachment={attachment}
          fallbackLabel={`Anexo comercial ${index + 1}`}
          height={imageHeight}
        />
        {(attachment.title || attachment.description) ? (
          <div style={{ marginTop: '12px' }}>
            {attachment.title ? (
              <p style={{ fontSize: titleSize, fontWeight: '700', color: '#222', margin: 0 }}>
                {attachment.title}
              </p>
            ) : null}
            {attachment.description ? (
              <p style={{ fontSize: descriptionSize, color: '#666', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                {attachment.description}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentPreviewPage({
  attachments,
  layout,
  pageIndex,
  pageCount,
  brandColor,
  docLabel,
  docNumber,
}) {
  const isGalleryFour = layout === 'gallery_4';
  const isGalleryTwo = layout === 'gallery_2';
  const gridTemplateColumns = isGalleryFour ? '1fr 1fr' : '1fr';

  return (
    <div style={{ border: '1px solid #ece7e2', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)' }}>
      <div style={{ padding: '16px 18px', backgroundColor: `${brandColor}12`, borderBottom: `1px solid ${brandColor}20` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '10px', fontWeight: '700', color: brandColor, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
              Anexo Comercial
            </p>
            <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
              {docLabel} {docNumber || '-'} · Página anexa {pageIndex + 1} de {pageCount}
            </p>
          </div>
          <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
            {isGalleryFour ? 'Galería 4' : isGalleryTwo ? 'Galería 2' : 'Presentación Premium'}
          </p>
        </div>
      </div>

      <div style={{ padding: '18px', backgroundColor: '#faf8f6' }}>
        <div style={{ display: 'grid', gap: '16px', gridTemplateColumns }}>
          {attachments.map((attachment, index) => (
            <AttachmentCard
              key={attachment.id}
              attachment={attachment}
              index={index}
              brandColor={brandColor}
              compact={layout !== 'premium'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PreviewModal({ document: doc, type, onClose }) {
  const { symbol } = useCurrency();
  const previewRef = useRef(null);
  const resolvedDoc = resolveDocumentBranding(doc);
  const [resolvedAttachments, setResolvedAttachments] = useState([]);

  const docNumber = type === 'invoice' ? resolvedDoc.invoice_number : resolvedDoc.quote_number;
  const docLabel = type === 'invoice' ? 'Factura' : 'Cotización';
  const headerDocLabel = type === 'invoice' ? 'FACTURA' : 'COTIZACIÓN';
  const recipientLabel = type === 'invoice' ? 'FACTURADO A' : 'COTIZADO PARA';
  const brandColor = resolvedDoc.brand_color || '#D94F8A';
  const fontFamily = resolvedDoc.font_family || 'Inter';
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;600;700&display=swap`;

  const additionalCharges = (resolvedDoc.additional_charges || []).filter((charge) => charge.name && Number(charge.amount || 0) > 0);
  const additionalChargesTotal = Number(resolvedDoc.additional_charges_total ?? additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0));
  const subtotalBeforeTax = Number(resolvedDoc.subtotal_before_tax ?? ((resolvedDoc.subtotal || 0) + additionalChargesTotal));
  const taxAmount = resolvedDoc.tax_enabled ? subtotalBeforeTax * ((resolvedDoc.tax_pct || 0) / 100) : 0;
  const totalFinal = Number(resolvedDoc.total_final ?? subtotalBeforeTax + taxAmount);
  const validItems = (resolvedDoc.line_items || []).filter((item) => item.description);
  const logoWidth = Number(resolvedDoc.logo_width || 24);
  const displayLogoWidth = Math.min(logoWidth * 3.1, 118);
  const logoPosition = resolvedDoc.logo_position || 'left';
  const logoAlign = logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'flex-end' : 'flex-start';
  const textAlign = logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'right' : 'left';
  const companyDetails = [
    resolvedDoc.doc_show_fiscal_id !== false && resolvedDoc.fiscal_id ? `RNC / ID: ${resolvedDoc.fiscal_id}` : '',
    resolvedDoc.doc_show_address !== false && (resolvedDoc.address || resolvedDoc.fiscal_address) ? (resolvedDoc.address || resolvedDoc.fiscal_address) : '',
    resolvedDoc.doc_show_address !== false && resolvedDoc.city_country ? resolvedDoc.city_country : '',
  ].filter(Boolean);
  const contactDetails = [
    resolvedDoc.doc_show_contact !== false && resolvedDoc.contact_name ? [resolvedDoc.contact_name, resolvedDoc.contact_title].filter(Boolean).join(' · ') : '',
    resolvedDoc.doc_show_contact !== false && resolvedDoc.contact_email ? resolvedDoc.contact_email : '',
    resolvedDoc.doc_show_contact !== false && resolvedDoc.phone_primary ? resolvedDoc.phone_primary : '',
    resolvedDoc.doc_show_contact !== false && resolvedDoc.phone_secondary ? resolvedDoc.phone_secondary : '',
  ].filter(Boolean);
  const socialDetails = [
    resolvedDoc.website_url,
    resolvedDoc.instagram_url,
    resolvedDoc.facebook_url,
    resolvedDoc.tiktok_url,
    resolvedDoc.linkedin_url,
    resolvedDoc.whatsapp_url,
  ].filter(Boolean);
  const signerName = resolvedDoc.contact_name || resolvedDoc.company_name || 'Firma autorizada';
  const signerMeta = [resolvedDoc.contact_title, resolvedDoc.contact_email].filter(Boolean).join(' · ');
  const visualAttachments = useMemo(
    () => sanitizeVisualAttachments(resolvedDoc.visual_attachments || []).filter((attachment) => attachment.include_in_pdf !== false),
    [resolvedDoc.visual_attachments]
  );
  const attachmentLayout = useMemo(
    () => sanitizeCommercialAttachmentLayout(resolvedDoc.commercial_attachments_layout || resolvedDoc.visual_attachments_layout),
    [resolvedDoc.commercial_attachments_layout, resolvedDoc.visual_attachments_layout]
  );
  const attachmentLayoutLabel = useMemo(
    () => getCommercialAttachmentLayoutLabel(attachmentLayout),
    [attachmentLayout]
  );
  const attachmentPages = useMemo(
    () => chunkCommercialAttachments(resolvedAttachments, attachmentLayout),
    [attachmentLayout, resolvedAttachments]
  );

  useEffect(() => {
    let active = true;

    const hydrateAttachments = async () => {
      const nextAttachments = await resolveVisualAttachmentsForDisplay(visualAttachments);
      if (active) {
        setResolvedAttachments(nextAttachments);
      }
    };

    if (visualAttachments.length === 0) {
      setResolvedAttachments([]);
      return () => {
        active = false;
      };
    }

    hydrateAttachments();

    return () => {
      active = false;
    };
  }, [visualAttachments]);

  const handleExportPDF = async () => {
    await generateBillingDocumentPdf({ doc: resolvedDoc, type, symbol });
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl mt-4 mb-8">
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

        <div ref={previewRef} style={{ fontFamily: `'${fontFamily}', Arial, sans-serif`, backgroundColor: '#ffffff', padding: '40px', borderRadius: '12px' }}>
          <link rel="stylesheet" href={fontUrl} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', marginBottom: '32px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: logoAlign, textAlign }}>
              {resolvedDoc.logo_url && (
                <img
                  src={resolvedDoc.logo_url}
                  alt="Logo"
                  style={{
                    width: `${displayLogoWidth}px`,
                    maxHeight: '64px',
                    height: 'auto',
                    objectFit: 'contain',
                    marginBottom: '8px',
                  }}
                  crossOrigin="anonymous"
                />
              )}
              <p style={{ fontSize: '18px', fontWeight: 'bold', color: brandColor, margin: 0 }}>
                {resolvedDoc.company_name || 'Mi Empresa'}
              </p>
              {resolvedDoc.fiscal_name && resolvedDoc.fiscal_name !== resolvedDoc.company_name && (
                <p style={{ fontSize: '12px', color: '#666', margin: '3px 0 0 0' }}>{resolvedDoc.fiscal_name}</p>
              )}
              {companyDetails.map((detail) => (
                <p key={detail} style={{ fontSize: '11px', color: '#777', margin: '2px 0 0 0' }}>{detail}</p>
              ))}
              {contactDetails.length > 0 && (
                <p style={{ fontSize: '11px', color: '#777', margin: '6px 0 0 0' }}>{contactDetails.join(' · ')}</p>
              )}
            </div>
            <div style={{ textAlign: 'right', minWidth: '150px' }}>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: brandColor, margin: '0 0 4px 0' }}>{headerDocLabel}</p>
              <p style={{ fontSize: '13px', color: '#666', margin: '0 0 2px 0' }}>N° {docNumber}</p>
              <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>Fecha: {resolvedDoc.date}</p>
            </div>
          </div>

          <div style={{ backgroundColor: `${brandColor}12`, borderRadius: '10px', padding: '16px', marginBottom: '24px', border: `1px solid ${brandColor}26` }}>
            <p style={{ fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px 0' }}>{recipientLabel}</p>
            <p style={{ fontSize: '15px', fontWeight: 'bold', color: '#222', margin: '0 0 4px 0' }}>{resolvedDoc.client_name || '-'}</p>
            {resolvedDoc.client_email && <p style={{ fontSize: '13px', color: '#666', margin: '0 0 2px 0' }}>{resolvedDoc.client_email}</p>}
            {resolvedDoc.client_phone && <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>📞 {resolvedDoc.client_phone}</p>}
          </div>

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
              {validItems.map((item, index) => (
                <tr key={`${item.description}-${index}`} style={{ backgroundColor: '#ffffff' }}>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '240px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#666' }}>
                <span>Subtotal productos/servicios</span>
                <span>{symbol}{(resolvedDoc.subtotal || 0).toLocaleString()}</span>
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
              {resolvedDoc.tax_enabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', color: '#666' }}>
                  <span>ITBIS / IVA ({resolvedDoc.tax_pct}%)</span>
                  <span>{symbol}{taxAmount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginTop: '8px', backgroundColor: brandColor, borderRadius: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>TOTAL</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>{symbol}{totalFinal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
            <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
              {resolvedDoc.notes || (type === 'quote' ? 'Esta cotización es válida por 30 días.' : '')}
            </p>
            {resolvedDoc.doc_show_signature && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '28px' }}>
                <div style={{ borderTop: `1px solid ${brandColor}`, paddingTop: '6px', fontSize: '10px', color: '#777' }}>
                  <strong style={{ color: '#555' }}>{signerName}</strong>
                  {signerMeta && <span style={{ display: 'block', marginTop: '2px' }}>{signerMeta}</span>}
                </div>
                <div style={{ borderTop: `1px solid ${brandColor}`, paddingTop: '6px', fontSize: '10px', color: '#777' }}>Aceptado por cliente</div>
              </div>
            )}
            {resolvedDoc.doc_show_socials !== false && socialDetails.length > 0 && (
              <p style={{ fontSize: '10px', color: '#999', margin: '18px 0 0 0', lineHeight: 1.5 }}>
                {socialDetails.join(' · ')}
              </p>
            )}
          </div>

          {resolvedAttachments.length > 0 ? (
            <div style={{ marginTop: '32px' }}>
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '10px', fontWeight: '700', color: brandColor, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                  Anexos Comerciales
                </p>
                <p style={{ fontSize: '12px', color: '#777', margin: '6px 0 0 0' }}>
                  {resolvedAttachments.length} anexo{resolvedAttachments.length === 1 ? '' : 's'} · {attachmentLayoutLabel}
                </p>
                <p style={{ fontSize: '12px', color: '#777', margin: '6px 0 0 0' }}>
                  Estas páginas se incluirán al final del PDF como anexos comerciales.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px' }}>
                {resolvedAttachments.map((attachment, index) => (
                  <div key={attachment.id} style={{ minWidth: '110px', border: '1px solid #ece7e2', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#fff' }}>
                    <AttachmentImage
                      attachment={attachment}
                      fallbackLabel={`Miniatura ${index + 1}`}
                      height="84px"
                    />
                    <div style={{ padding: '8px 10px' }}>
                      <p style={{ fontSize: '11px', fontWeight: '600', color: '#333', margin: 0 }}>
                        {attachment.title || `Anexo ${index + 1}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '18px' }}>
                {attachmentPages.map((pageAttachments, index) => (
                  <AttachmentPreviewPage
                    key={`attachment-page-${index}`}
                    attachments={pageAttachments}
                    layout={attachmentLayout}
                    pageIndex={index}
                    pageCount={attachmentPages.length}
                    brandColor={brandColor}
                    docLabel={docLabel}
                    docNumber={docNumber}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
