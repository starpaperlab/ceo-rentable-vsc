import jsPDF from 'jspdf';
import { resolveDocumentBranding } from '@/lib/documentBranding';
import {
  chunkCommercialAttachments,
  COMMERCIAL_ATTACHMENT_LAYOUTS,
  DEFAULT_COMMERCIAL_ATTACHMENT_LAYOUT,
  resolveVisualAttachmentsForDisplay,
  sanitizeCommercialAttachmentLayout,
  sanitizeVisualAttachments,
} from '@/lib/visualAttachments';

const PAGE = {
  marginX: 16,
  marginTop: 16,
  marginBottom: 16,
  footerHeight: 10,
};

const TABLE = {
  headerHeight: 12,
  rowMinHeight: 13,
  lineHeight: 4.8,
  cellPaddingX: 4,
  cellPaddingY: 4.6,
};

const COLUMNS = {
  description: 104,
  price: 28,
  quantity: 14,
  total: 32,
};

const TABLE_WIDTH = COLUMNS.description + COLUMNS.price + COLUMNS.quantity + COLUMNS.total;

function hexToRgb(hex = '#D94F8A') {
  const normalized = `${hex || '#D94F8A'}`.replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);

  return {
    r: parseInt(value.slice(0, 2), 16) || 217,
    g: parseInt(value.slice(2, 4), 16) || 79,
    b: parseInt(value.slice(4, 6), 16) || 138,
  };
}

function withAlpha(hex, alpha = 0.08) {
  const { r, g, b } = hexToRgb(hex);
  return {
    r: Math.round(255 - (255 - r) * alpha),
    g: Math.round(255 - (255 - g) * alpha),
    b: Math.round(255 - (255 - b) * alpha),
  };
}

function toMoney(value, symbol = '$') {
  const amount = Number(value || 0);
  return `${symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function getDocMeta(doc, type) {
  return {
    number: type === 'invoice' ? doc.invoice_number : doc.quote_number,
    label: type === 'invoice' ? 'FACTURA' : 'COTIZACIÓN',
    shortLabel: type === 'invoice' ? 'Factura' : 'Cotización',
    recipientLabel: type === 'invoice' ? 'FACTURADO A' : 'COTIZADO PARA',
  };
}

function getValidItems(doc) {
  return (doc.line_items || []).filter((item) => `${item?.description || ''}`.trim());
}

async function loadImageAsDataUrl(url) {
  if (!url) return null;
  const getDimensions = (src) =>
    new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      image.onerror = () => resolve({ width: 0, height: 0 });
      image.src = src;
    });

  if (`${url}`.startsWith('data:image/')) {
    const dimensions = await getDimensions(url);
    return { dataUrl: url, ...dimensions };
  }

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;

    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dimensions = await getDimensions(dataUrl);
    return { dataUrl, ...dimensions };
  } catch {
    return null;
  }
}

function getLogoWidth(doc = {}) {
  const sizeMap = {
    small: 14,
    medium: 20,
    large: 26,
  };
  const logoSize = `${doc.logo_size || 'medium'}`.trim();
  const width = logoSize === 'custom'
    ? Number(doc.logo_width || 0)
    : sizeMap[logoSize] || Number(doc.logo_width || 0) || sizeMap.medium;

  if (!Number.isFinite(width) || width <= 0) return sizeMap.medium;
  return Math.min(width, 42);
}

function getLogoDisplaySize(logoImage, doc = {}) {
  const maxWidth = getLogoWidth(doc);
  const maxHeight = 18;
  const ratio = logoImage?.width > 0 && logoImage?.height > 0
    ? logoImage.height / logoImage.width
    : 1;

  let width = maxWidth;
  let height = width * ratio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height / ratio;
  }

  return { width, height };
}

function addLogo(pdf, logoImage, x, y, doc) {
  if (!logoImage?.dataUrl) return { width: 0, height: 0 };

  try {
    const { width, height } = getLogoDisplaySize(logoImage, doc);
    pdf.addImage(logoImage.dataUrl, undefined, x, y, width, height, undefined, 'FAST');
    return { width, height };
  } catch {
    // El PDF sigue siendo válido si el logo remoto no permite CORS o usa un formato no soportado.
    return { width: 0, height: 0 };
  }
}

function getLogoX(pdf, logoImage, doc = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const { width: logoWidth } = getLogoDisplaySize(logoImage, doc);
  const position = doc.logo_position || 'left';

  if (position === 'center') return (pageWidth - logoWidth) / 2;
  if (position === 'right') return pageWidth - PAGE.marginX - logoWidth;
  return PAGE.marginX;
}

function getCompanyDetails(doc = {}) {
  return [
    doc.doc_show_fiscal_id !== false && doc.fiscal_id ? `RNC / ID: ${doc.fiscal_id}` : '',
    doc.doc_show_address !== false && (doc.address || doc.fiscal_address) ? (doc.address || doc.fiscal_address) : '',
    doc.doc_show_address !== false && doc.city_country ? doc.city_country : '',
    doc.doc_show_contact !== false && doc.contact_name ? [doc.contact_name, doc.contact_title].filter(Boolean).join(' · ') : '',
    doc.doc_show_contact !== false && doc.contact_email ? doc.contact_email : '',
    doc.doc_show_contact !== false && doc.phone_primary ? doc.phone_primary : '',
    doc.doc_show_contact !== false && doc.phone_secondary ? doc.phone_secondary : '',
  ].filter(Boolean);
}

function getSocialDetails(doc = {}) {
  if (doc.doc_show_socials === false) return [];
  return [
    doc.website_url,
    doc.instagram_url,
    doc.facebook_url,
    doc.tiktok_url,
    doc.linkedin_url,
    doc.whatsapp_url,
  ].filter(Boolean);
}

function getVisualAttachmentsForPdf(doc = {}) {
  return sanitizeVisualAttachments(doc.visual_attachments || []).filter((attachment) => attachment.include_in_pdf !== false);
}

function getCommercialAttachmentLayout(doc = {}) {
  return sanitizeCommercialAttachmentLayout(doc.commercial_attachments_layout || doc.visual_attachments_layout || DEFAULT_COMMERCIAL_ATTACHMENT_LAYOUT);
}

function drawPageFooter(pdf, { doc, meta, pageNumber, totalPages }) {
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const footerY = height - 11;
  const socialDetails = getSocialDetails(doc);
  const docReference = `${meta.shortLabel} ${meta.number || '-'}`;
  const footerText = [
    docReference,
    ...socialDetails.filter((item) => /instagram|@|https?:\/\/|www\./i.test(item)).slice(0, 2),
  ].filter(Boolean).join(' · ');

  pdf.setFont('helvetica', 'normal');
  pdf.setDrawColor(236, 232, 228);
  pdf.setLineWidth(0.15);
  pdf.line(PAGE.marginX, height - 17, width - PAGE.marginX, height - 17);
  pdf.setFontSize(8);
  pdf.setTextColor(135, 135, 135);
  if (footerText) {
    pdf.text(pdf.splitTextToSize(footerText, 108), PAGE.marginX, footerY);
  }
  pdf.text(`Página ${pageNumber} de ${totalPages}`, width - PAGE.marginX, footerY, { align: 'right' });
}

function drawDocumentHeader(pdf, { doc, meta, brandColor, brandRgb, logoImage, isFirstPage }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = PAGE.marginTop;

  if (isFirstPage) {
    const logoPosition = doc.logo_position || 'left';
    const logoX = getLogoX(pdf, logoImage, doc);
    const textX = logoPosition === 'center'
      ? pageWidth / 2
      : logoPosition === 'right'
        ? pageWidth - PAGE.marginX
        : PAGE.marginX;
    const textAlign = logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'right' : 'left';
    const logoSize = addLogo(pdf, logoImage, logoX, y, doc);
    const logoHeight = logoSize.height;
    const companyDetails = getCompanyDetails(doc);

    pdf.setFillColor(brandRgb.r, brandRgb.g, brandRgb.b);
    pdf.roundedRect(PAGE.marginX, y - 4, 34, 2, 1, 1, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
    pdf.text(doc.company_name || 'Mi Empresa', textX, y + (logoHeight ? logoHeight + 7 : 4), { align: textAlign });

    let companyY = y + (logoHeight ? logoHeight + 13 : 10);
    if (doc.fiscal_name && doc.fiscal_name !== doc.company_name) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(95, 95, 95);
      pdf.text(doc.fiscal_name, textX, companyY, { align: textAlign });
      companyY += 5;
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(115, 115, 115);
    companyDetails.slice(0, 5).forEach((line) => {
      const lineParts = pdf.splitTextToSize(line, 74);
      pdf.text(lineParts, textX, companyY, { align: textAlign });
      companyY += lineParts.length * 4;
    });

    const titleBg = withAlpha(brandColor, 0.1);
    pdf.setFillColor(titleBg.r, titleBg.g, titleBg.b);
    pdf.roundedRect(pageWidth - PAGE.marginX - 52, y - 3, 52, 14, 3, 3, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
    pdf.text(meta.label, pageWidth - PAGE.marginX - 26, y + 6.5, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(95, 95, 95);
    pdf.text(`N° ${meta.number || '-'}`, pageWidth - PAGE.marginX, y + 18, { align: 'right' });
    pdf.setFontSize(10);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`Fecha: ${doc.date || '-'}`, pageWidth - PAGE.marginX, y + 25, { align: 'right' });

    y = Math.max(y + 40, companyY + 6);

    const clientBg = withAlpha(brandColor, 0.1);
    pdf.setFillColor(clientBg.r, clientBg.g, clientBg.b);
    pdf.roundedRect(PAGE.marginX, y, pageWidth - PAGE.marginX * 2, 27, 3, 3, 'F');
    pdf.setDrawColor(brandRgb.r, brandRgb.g, brandRgb.b);
    pdf.setLineWidth(0.2);
    pdf.line(PAGE.marginX, y, PAGE.marginX, y + 27);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(meta.recipientLabel, PAGE.marginX + 4, y + 6);

    pdf.setFontSize(12);
    pdf.setTextColor(34, 34, 34);
    pdf.text(doc.client_name || '-', PAGE.marginX + 4, y + 13);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(90, 90, 90);
    const contact = [doc.client_email, doc.client_phone].filter(Boolean).join(' · ');
    if (contact) {
      pdf.text(contact, PAGE.marginX + 4, y + 20);
    }

    return y + 36;
  }

  const bandBg = withAlpha(brandColor, 0.08);
  pdf.setFillColor(bandBg.r, bandBg.g, bandBg.b);
  pdf.roundedRect(PAGE.marginX, y - 5, pageWidth - PAGE.marginX * 2, 12, 2.5, 2.5, 'F');
  pdf.setDrawColor(236, 232, 228);
  pdf.setLineWidth(0.15);
  pdf.line(PAGE.marginX, y + 9, pageWidth - PAGE.marginX, y + 9);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.text(doc.company_name || 'Mi Empresa', PAGE.marginX + 4, y + 2);
  pdf.text(`${meta.label} · N° ${meta.number || '-'}`, pageWidth - PAGE.marginX - 4, y + 2, { align: 'right' });

  return y + 16;
}

function drawTableHeader(pdf, y, brandRgb) {
  const x = PAGE.marginX;

  const lightBrand = {
    r: Math.round(255 - (255 - brandRgb.r) * 0.12),
    g: Math.round(255 - (255 - brandRgb.g) * 0.12),
    b: Math.round(255 - (255 - brandRgb.b) * 0.12),
  };

  pdf.setDrawColor(232, 226, 221);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, y, TABLE_WIDTH, TABLE.headerHeight, 2.5, 2.5, 'S');
  pdf.setFillColor(lightBrand.r, lightBrand.g, lightBrand.b);
  pdf.roundedRect(x, y, TABLE_WIDTH, TABLE.headerHeight, 2.5, 2.5, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.text('DESCRIPCIÓN', x + TABLE.cellPaddingX, y + 7.5);
  pdf.text('PRECIO', x + COLUMNS.description + COLUMNS.price - TABLE.cellPaddingX, y + 7.5, { align: 'right' });
  pdf.text('CANT.', x + COLUMNS.description + COLUMNS.price + COLUMNS.quantity - TABLE.cellPaddingX, y + 7.5, { align: 'right' });
  pdf.text('TOTAL', x + TABLE_WIDTH - TABLE.cellPaddingX, y + 7.5, { align: 'right' });

  return y + TABLE.headerHeight + 1.5;
}

function getRowHeight(pdf, item) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const lines = pdf.splitTextToSize(`${item.description || ''}`, COLUMNS.description - TABLE.cellPaddingX * 2);
  return Math.max(TABLE.rowMinHeight, lines.length * TABLE.lineHeight + TABLE.cellPaddingY * 2);
}

function drawTableRow(pdf, item, y, index, symbol) {
  const x = PAGE.marginX;
  const rowHeight = getRowHeight(pdf, item);
  const descriptionLines = pdf.splitTextToSize(`${item.description || ''}`, COLUMNS.description - TABLE.cellPaddingX * 2);
  const unitPrice = Number(item.unit_price || 0);
  const quantity = Number(item.quantity || 0);
  const total = unitPrice * quantity;

  if (index % 2 === 0) {
    pdf.setFillColor(254, 252, 250);
    pdf.rect(x, y, TABLE_WIDTH, rowHeight, 'F');
  }
  pdf.setDrawColor(232, 226, 221);
  pdf.setLineWidth(0.12);
  pdf.line(x, y + rowHeight, x + TABLE_WIDTH, y + rowHeight);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(51, 51, 51);
  pdf.text(descriptionLines, x + TABLE.cellPaddingX, y + TABLE.cellPaddingY + 3.5);

  pdf.setTextColor(85, 85, 85);
  pdf.text(toMoney(unitPrice, symbol), x + COLUMNS.description + COLUMNS.price - TABLE.cellPaddingX, y + TABLE.cellPaddingY + 3.5, { align: 'right' });
  pdf.text(`${quantity || 0}`, x + COLUMNS.description + COLUMNS.price + COLUMNS.quantity - TABLE.cellPaddingX, y + TABLE.cellPaddingY + 3.5, { align: 'right' });

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(34, 34, 34);
  pdf.text(toMoney(total, symbol), x + TABLE_WIDTH - TABLE.cellPaddingX, y + TABLE.cellPaddingY + 3.5, { align: 'right' });

  return y + rowHeight;
}

function getAdditionalCharges(doc = {}) {
  return (doc.additional_charges || [])
    .map((charge) => ({
      name: `${charge?.name || charge?.concept || charge?.label || ''}`.trim(),
      amount: Number(charge?.amount || 0),
    }))
    .filter((charge) => charge.name && charge.amount > 0);
}

function drawTotals(pdf, { doc, taxAmount, totalFinal, symbol, brandRgb, y }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const boxWidth = 82;
  const x = pageWidth - PAGE.marginX - boxWidth;
  const additionalCharges = getAdditionalCharges(doc);
  const additionalChargesTotal = Number(
    doc.additional_charges_total ?? additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0)
  );
  const subtotalBeforeTax = Number(doc.subtotal_before_tax ?? Number(doc.subtotal || 0) + additionalChargesTotal);

  const lineCount = 1
    + additionalCharges.length
    + (additionalChargesTotal > 0 ? 1 : 0)
    + (doc.tax_enabled ? 1 : 0);
  const cardHeight = 10 + lineCount * 8 + 18;
  const startY = y;

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(232, 226, 221);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, startY, boxWidth, cardHeight, 3, 3, 'FD');
  y += 5;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(95, 95, 95);
  pdf.text('Subtotal productos/servicios', x + 5, y + 5);
  pdf.text(toMoney(doc.subtotal || 0, symbol), x + boxWidth - 5, y + 5, { align: 'right' });
  y += 8;

  additionalCharges.forEach((charge) => {
    pdf.text(charge.name, x + 5, y + 5);
    pdf.text(toMoney(charge.amount, symbol), x + boxWidth - 5, y + 5, { align: 'right' });
    y += 8;
  });

  if (additionalChargesTotal > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(60, 60, 60);
    pdf.setDrawColor(238, 234, 230);
    pdf.line(x + 5, y, x + boxWidth - 5, y);
    pdf.text('Subtotal antes de impuestos', x + 5, y + 5);
    pdf.text(toMoney(subtotalBeforeTax, symbol), x + boxWidth - 5, y + 5, { align: 'right' });
    y += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(95, 95, 95);
  }

  if (doc.tax_enabled) {
    pdf.text(`ITBIS / IVA (${doc.tax_pct || 0}%)`, x + 5, y + 5);
    pdf.text(toMoney(taxAmount, symbol), x + boxWidth - 5, y + 5, { align: 'right' });
    y += 8;
  }

  pdf.setFillColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.roundedRect(x + 4, y + 2, boxWidth - 8, 15, 3, 3, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.text('TOTAL', x + 9, y + 11);
  pdf.setFontSize(13);
  pdf.text(toMoney(totalFinal, symbol), x + boxWidth - 9, y + 11, { align: 'right' });

  return startY + cardHeight + 4;
}

function drawNotes(pdf, { doc, type, y, brandRgb }) {
  const note = doc.notes || (type === 'quote' ? 'Esta cotización es válida por 30 días.' : '');
  const socialDetails = getSocialDetails(doc);
  const width = pdf.internal.pageSize.getWidth() - PAGE.marginX * 2;
  const signerName = doc.contact_name || doc.company_name || 'Firma autorizada';
  const signerMeta = [doc.contact_title, doc.contact_email].filter(Boolean).join(' · ');

  pdf.setDrawColor(235, 235, 235);
  pdf.line(PAGE.marginX, y, PAGE.marginX + width, y);
  y += 6;

  if (note) {
    const lines = pdf.splitTextToSize(note, width);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(150, 150, 150);
    pdf.text(lines, PAGE.marginX, y);
    y += lines.length * 4.4 + 4;
  }

  if (doc.doc_show_signature) {
    const signatureY = y + 12;
    const colWidth = 74;
    pdf.setDrawColor(brandRgb.r, brandRgb.g, brandRgb.b);
    pdf.line(PAGE.marginX, signatureY, PAGE.marginX + colWidth, signatureY);
    pdf.line(PAGE.marginX + 96, signatureY, PAGE.marginX + 96 + colWidth, signatureY);
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.setFont('helvetica', 'bold');
    pdf.text(signerName, PAGE.marginX, signatureY + 5);
    if (signerMeta) {
      pdf.setFont('helvetica', 'normal');
      pdf.text(pdf.splitTextToSize(signerMeta, colWidth), PAGE.marginX, signatureY + 9);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.text('Aceptado por cliente', PAGE.marginX + 96, signatureY + 5);
    y = signatureY + (signerMeta ? 16 : 12);
  }

  if (socialDetails.length > 0) {
    const socialLines = pdf.splitTextToSize(socialDetails.join(' · '), width);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(145, 145, 145);
    pdf.text(socialLines, PAGE.marginX, y);
    y += socialLines.length * 4;
  }

  return y;
}

function getAttachmentDisplaySize(attachmentImage, maxWidth, maxHeight) {
  const width = Number(attachmentImage?.width || 0);
  const height = Number(attachmentImage?.height || 0);

  if (!width || !height) {
    return { width: Math.min(maxWidth, 120), height: Math.min(maxHeight, 120) };
  }

  const ratio = width / height;
  let targetWidth = maxWidth;
  let targetHeight = targetWidth / ratio;

  if (targetHeight > maxHeight) {
    targetHeight = maxHeight;
    targetWidth = targetHeight * ratio;
  }

  return {
    width: Math.max(10, targetWidth),
    height: Math.max(10, targetHeight),
  };
}

function drawCommercialAttachmentPageHeader(pdf, {
  meta,
  brandColor,
  brandRgb,
  pageIndex,
  pageCount,
}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = PAGE.marginTop;

  const bandBg = withAlpha(brandColor, 0.1);
  pdf.setFillColor(bandBg.r, bandBg.g, bandBg.b);
  pdf.roundedRect(PAGE.marginX, y - 4, pageWidth - PAGE.marginX * 2, 14, 3, 3, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.text('ANEXO COMERCIAL', PAGE.marginX + 4, y + 4);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(120, 120, 120);
  pdf.text(`${meta.label} · N° ${meta.number || '-'} · Página anexa ${pageIndex + 1} de ${pageCount}`, pageWidth - PAGE.marginX - 4, y + 4, {
    align: 'right',
  });

  return y + 18;
}

function drawAttachmentPlaceholder(pdf, x, y, width, height) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(140, 140, 140);
  pdf.text('No se pudo cargar esta imagen.', x + (width / 2), y + (height / 2), { align: 'center' });
}

function drawAttachmentTitleAndDescription(pdf, {
  attachment,
  x,
  y,
  width,
  titleFontSize = 14,
  bodyFontSize = 10,
  maxDescriptionLines = null,
}) {
  let nextY = y;

  if (attachment.title) {
    const titleLines = pdf.splitTextToSize(attachment.title, width);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(titleFontSize);
    pdf.setTextColor(35, 35, 35);
    pdf.text(titleLines, x, nextY);
    nextY += titleLines.length * (titleFontSize >= 14 ? 6 : 5);
  }

  if (attachment.description) {
    const descriptionLines = pdf.splitTextToSize(attachment.description, width);
    const safeLines = maxDescriptionLines ? descriptionLines.slice(0, maxDescriptionLines) : descriptionLines;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(bodyFontSize);
    pdf.setTextColor(105, 105, 105);
    pdf.text(safeLines, x, nextY);
    nextY += safeLines.length * (bodyFontSize >= 10 ? 4.8 : 4.2) + 4;
  }

  return nextY;
}

function drawPremiumAttachmentPage(pdf, {
  attachment,
  imageAsset,
  meta,
  brandColor,
  brandRgb,
  pageIndex,
  pageCount,
}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = drawCommercialAttachmentPageHeader(pdf, {
    meta,
    brandColor,
    brandRgb,
    pageIndex,
    pageCount,
  });

  y = drawAttachmentTitleAndDescription(pdf, {
    attachment,
    x: PAGE.marginX,
    y,
    width: pageWidth - PAGE.marginX * 2,
  });

  const maxWidth = pageWidth - PAGE.marginX * 2;
  const maxHeight = pageHeight - y - PAGE.marginBottom - PAGE.footerHeight - 8;

  pdf.setDrawColor(235, 230, 226);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(PAGE.marginX, y, maxWidth, maxHeight, 4, 4, 'S');

  if (imageAsset?.dataUrl) {
    const displaySize = getAttachmentDisplaySize(imageAsset, maxWidth - 10, maxHeight - 10);
    const imageX = (pageWidth - displaySize.width) / 2;
    const imageY = y + Math.max(5, (maxHeight - displaySize.height) / 2);

    try {
      pdf.addImage(imageAsset.dataUrl, undefined, imageX, imageY, displaySize.width, displaySize.height, undefined, 'FAST');
    } catch {
      drawAttachmentPlaceholder(pdf, PAGE.marginX, y, maxWidth, maxHeight);
    }
    return;
  }

  drawAttachmentPlaceholder(pdf, PAGE.marginX, y, maxWidth, maxHeight);
}

function drawGalleryAttachmentCard(pdf, {
  attachment,
  imageAsset,
  x,
  y,
  width,
  height,
  compact = false,
}) {
  const padding = compact ? 5 : 6;
  const textAreaHeight = compact ? 22 : 28;
  const innerWidth = width - padding * 2;
  const imageAreaHeight = height - padding * 2 - textAreaHeight;

  pdf.setDrawColor(235, 230, 226);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, y, width, height, 3, 3, 'S');

  if (imageAsset?.dataUrl) {
    const displaySize = getAttachmentDisplaySize(imageAsset, innerWidth, imageAreaHeight);
    const imageX = x + (width - displaySize.width) / 2;
    const imageY = y + padding + Math.max(0, (imageAreaHeight - displaySize.height) / 2);

    try {
      pdf.addImage(imageAsset.dataUrl, undefined, imageX, imageY, displaySize.width, displaySize.height, undefined, 'FAST');
    } catch {
      drawAttachmentPlaceholder(pdf, x + padding, y + padding, innerWidth, imageAreaHeight);
    }
  } else {
    drawAttachmentPlaceholder(pdf, x + padding, y + padding, innerWidth, imageAreaHeight);
  }

  drawAttachmentTitleAndDescription(pdf, {
    attachment,
    x: x + padding,
    y: y + padding + imageAreaHeight + 5,
    width: innerWidth,
    titleFontSize: compact ? 10.5 : 11.5,
    bodyFontSize: compact ? 8.5 : 9,
    maxDescriptionLines: compact ? 2 : 3,
  });
}

function drawGalleryAttachmentPage(pdf, {
  attachments,
  imageAssets,
  meta,
  brandColor,
  brandRgb,
  pageIndex,
  pageCount,
  layout,
}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = drawCommercialAttachmentPageHeader(pdf, {
    meta,
    brandColor,
    brandRgb,
    pageIndex,
    pageCount,
  });

  const columns = layout === COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_4 ? 2 : 1;
  const rows = layout === COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_4 ? 2 : 2;
  const gap = 8;
  const availableWidth = pageWidth - PAGE.marginX * 2;
  const availableHeight = pageHeight - y - PAGE.marginBottom - PAGE.footerHeight;
  const cardWidth = (availableWidth - gap * (columns - 1)) / columns;
  const cardHeight = (availableHeight - gap * (rows - 1)) / rows;

  attachments.forEach((attachment, index) => {
    const column = columns === 1 ? 0 : index % columns;
    const row = columns === 1 ? index : Math.floor(index / columns);
    const cardX = PAGE.marginX + column * (cardWidth + gap);
    const cardY = y + row * (cardHeight + gap);

    drawGalleryAttachmentCard(pdf, {
      attachment,
      imageAsset: imageAssets[index],
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: cardHeight,
      compact: layout === COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_4,
    });
  });
}

export async function generateBillingDocumentPdf({ doc, type, symbol = '$' }) {
  const resolvedDoc = resolveDocumentBranding(doc);
  const pdf = new jsPDF('p', 'mm', 'a4');
  const meta = getDocMeta(resolvedDoc, type);
  const brandColor = resolvedDoc.brand_color || '#D94F8A';
  const brandRgb = hexToRgb(brandColor);
  const attachmentLayout = getCommercialAttachmentLayout(resolvedDoc);
  const logoImage = await loadImageAsDataUrl(resolvedDoc.logo_url);
  const items = getValidItems(resolvedDoc);
  const additionalCharges = getAdditionalCharges(resolvedDoc);
  const additionalChargesTotal = Number(
    resolvedDoc.additional_charges_total ?? additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0)
  );
  const subtotalBeforeTax = Number(resolvedDoc.subtotal_before_tax ?? Number(resolvedDoc.subtotal || 0) + additionalChargesTotal);
  const taxAmount = resolvedDoc.tax_enabled ? (subtotalBeforeTax * (Number(resolvedDoc.tax_pct || 0) / 100)) : 0;
  const totalFinal = Number(resolvedDoc.total_final || 0) || subtotalBeforeTax + taxAmount;
  const contentBottom = () => pdf.internal.pageSize.getHeight() - PAGE.marginBottom - PAGE.footerHeight;
  const visualAttachments = await resolveVisualAttachmentsForDisplay(getVisualAttachmentsForPdf(resolvedDoc));
  const attachmentPages = chunkCommercialAttachments(visualAttachments, attachmentLayout);

  let y = drawDocumentHeader(pdf, { doc: resolvedDoc, meta, brandColor, brandRgb, logoImage, isFirstPage: true });
  y = drawTableHeader(pdf, y, brandRgb);

  items.forEach((item, index) => {
    const rowHeight = getRowHeight(pdf, item);
    if (y + rowHeight > contentBottom()) {
      pdf.addPage();
      y = drawDocumentHeader(pdf, { doc: resolvedDoc, meta, brandColor, brandRgb, logoImage, isFirstPage: false });
      y = drawTableHeader(pdf, y, brandRgb);
    }

    y = drawTableRow(pdf, item, y, index, symbol);
  });

  const noteLines = (resolvedDoc.notes || type === 'quote') ? 2 : 0;
  const footerHeight = noteLines * 5
    + (resolvedDoc.doc_show_signature ? 28 : 0)
    + (getSocialDetails(resolvedDoc).length > 0 ? 12 : 0);
  const totalsHeight = 58 + additionalCharges.length * 8 + footerHeight;
  if (y + totalsHeight > contentBottom()) {
    pdf.addPage();
    y = drawDocumentHeader(pdf, { doc: resolvedDoc, meta, brandColor, brandRgb, logoImage, isFirstPage: false });
  } else {
    y += 8;
  }

  y = drawTotals(pdf, { doc: resolvedDoc, taxAmount, totalFinal, symbol, brandRgb, y });
  drawNotes(pdf, { doc: resolvedDoc, type, y, brandRgb });

  for (let index = 0; index < attachmentPages.length; index += 1) {
    const pageAttachments = attachmentPages[index];
    const imageAssets = await Promise.all(
      pageAttachments.map((attachment) => (
        attachment.resolved_url ? loadImageAsDataUrl(attachment.resolved_url) : Promise.resolve(null)
      ))
    );
    pdf.addPage();
    if (attachmentLayout === COMMERCIAL_ATTACHMENT_LAYOUTS.PREMIUM) {
      drawPremiumAttachmentPage(pdf, {
        attachment: pageAttachments[0],
        imageAsset: imageAssets[0],
        meta,
        brandColor,
        brandRgb,
        pageIndex: index,
        pageCount: attachmentPages.length,
      });
    } else {
      drawGalleryAttachmentPage(pdf, {
        attachments: pageAttachments,
        imageAssets,
        meta,
        brandColor,
        brandRgb,
        pageIndex: index,
        pageCount: attachmentPages.length,
        layout: attachmentLayout,
      });
    }
  }

  const totalPages = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pdf.setPage(pageNumber);
    drawPageFooter(pdf, { doc: resolvedDoc, meta, pageNumber, totalPages });
  }

  pdf.save(`${meta.label}-${meta.number || 'documento'}.pdf`);
}
