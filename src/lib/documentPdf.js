import jsPDF from 'jspdf';

const PAGE = {
  marginX: 16,
  marginTop: 16,
  marginBottom: 16,
  footerHeight: 10,
};

const TABLE = {
  headerHeight: 9,
  rowMinHeight: 10,
  lineHeight: 4.8,
  cellPaddingX: 3,
  cellPaddingY: 3.2,
};

const COLUMNS = {
  description: 92,
  price: 28,
  quantity: 20,
  total: 30,
};

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
    small: 18,
    medium: 24,
    large: 34,
  };
  const logoSize = `${doc.logo_size || 'medium'}`.trim();
  const width = logoSize === 'custom'
    ? Number(doc.logo_width || 0)
    : sizeMap[logoSize] || Number(doc.logo_width || 0) || sizeMap.medium;

  return Number.isFinite(width) && width > 0 ? width : sizeMap.medium;
}

function addLogo(pdf, logoImage, x, y, doc) {
  if (!logoImage?.dataUrl) return 0;

  try {
    const logoWidth = getLogoWidth(doc);
    const ratio = logoImage.width > 0 && logoImage.height > 0
      ? logoImage.height / logoImage.width
      : 0.45;
    const logoHeight = Math.min(26, logoWidth * ratio);
    pdf.addImage(logoImage.dataUrl, undefined, x, y, logoWidth, logoHeight, undefined, 'FAST');
    return logoHeight;
  } catch {
    // El PDF sigue siendo válido si el logo remoto no permite CORS o usa un formato no soportado.
    return 0;
  }
}

function getLogoX(pdf, doc = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const logoWidth = getLogoWidth(doc);
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

function drawPageFooter(pdf, pageNumber, totalPages) {
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(140, 140, 140);
  pdf.text(`Página ${pageNumber} de ${totalPages}`, width / 2, height - 8, { align: 'center' });
}

function drawDocumentHeader(pdf, { doc, meta, brandColor, brandRgb, logoImage, isFirstPage }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = PAGE.marginTop;

  if (isFirstPage) {
    const logoPosition = doc.logo_position || 'left';
    const logoX = getLogoX(pdf, doc);
    const textX = logoPosition === 'center'
      ? pageWidth / 2
      : logoPosition === 'right'
        ? pageWidth - PAGE.marginX
        : PAGE.marginX;
    const textAlign = logoPosition === 'center' ? 'center' : logoPosition === 'right' ? 'right' : 'left';
    const logoHeight = addLogo(pdf, logoImage, logoX, y, doc);
    const companyDetails = getCompanyDetails(doc);

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

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
    pdf.text(meta.label, pageWidth - PAGE.marginX, y + 6, { align: 'right' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(95, 95, 95);
    pdf.text(`N° ${meta.number || '-'}`, pageWidth - PAGE.marginX, y + 14, { align: 'right' });
    pdf.setFontSize(10);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`Fecha: ${doc.date || '-'}`, pageWidth - PAGE.marginX, y + 21, { align: 'right' });

    y = Math.max(y + 34, companyY + 5);

    const clientBg = withAlpha(brandColor, 0.1);
    pdf.setFillColor(clientBg.r, clientBg.g, clientBg.b);
    pdf.roundedRect(PAGE.marginX, y, pageWidth - PAGE.marginX * 2, 25, 2.5, 2.5, 'F');

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

    return y + 34;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.text(doc.company_name || 'Mi Empresa', PAGE.marginX, y);
  pdf.text(`${meta.label} N° ${meta.number || '-'}`, pageWidth - PAGE.marginX, y, { align: 'right' });

  return y + 8;
}

function drawTableHeader(pdf, y, brandRgb) {
  const x = PAGE.marginX;

  pdf.setFillColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.rect(x, y, COLUMNS.description + COLUMNS.price + COLUMNS.quantity + COLUMNS.total, TABLE.headerHeight, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Descripción', x + TABLE.cellPaddingX, y + 6);
  pdf.text('Precio', x + COLUMNS.description + COLUMNS.price - TABLE.cellPaddingX, y + 6, { align: 'right' });
  pdf.text('Cant.', x + COLUMNS.description + COLUMNS.price + COLUMNS.quantity - TABLE.cellPaddingX, y + 6, { align: 'right' });
  pdf.text('Total', x + COLUMNS.description + COLUMNS.price + COLUMNS.quantity + COLUMNS.total - TABLE.cellPaddingX, y + 6, { align: 'right' });

  return y + TABLE.headerHeight;
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

  pdf.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 248 : 255);
  pdf.rect(x, y, COLUMNS.description + COLUMNS.price + COLUMNS.quantity + COLUMNS.total, rowHeight, 'F');

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(51, 51, 51);
  pdf.text(descriptionLines, x + TABLE.cellPaddingX, y + TABLE.cellPaddingY + 3.2);

  pdf.setTextColor(85, 85, 85);
  pdf.text(toMoney(unitPrice, symbol), x + COLUMNS.description + COLUMNS.price - TABLE.cellPaddingX, y + TABLE.cellPaddingY + 3.2, { align: 'right' });
  pdf.text(`${quantity || 0}`, x + COLUMNS.description + COLUMNS.price + COLUMNS.quantity - TABLE.cellPaddingX, y + TABLE.cellPaddingY + 3.2, { align: 'right' });

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(34, 34, 34);
  pdf.text(toMoney(total, symbol), x + COLUMNS.description + COLUMNS.price + COLUMNS.quantity + COLUMNS.total - TABLE.cellPaddingX, y + TABLE.cellPaddingY + 3.2, { align: 'right' });

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
  const boxWidth = 78;
  const x = pageWidth - PAGE.marginX - boxWidth;
  const additionalCharges = getAdditionalCharges(doc);
  const additionalChargesTotal = Number(
    doc.additional_charges_total ?? additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0)
  );
  const subtotalBeforeTax = Number(doc.subtotal_before_tax ?? Number(doc.subtotal || 0) + additionalChargesTotal);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(95, 95, 95);
  pdf.text('Subtotal productos/servicios', x, y + 5);
  pdf.text(toMoney(doc.subtotal || 0, symbol), x + boxWidth, y + 5, { align: 'right' });
  y += 8;

  additionalCharges.forEach((charge) => {
    pdf.text(charge.name, x, y + 5);
    pdf.text(toMoney(charge.amount, symbol), x + boxWidth, y + 5, { align: 'right' });
    y += 8;
  });

  if (additionalChargesTotal > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(60, 60, 60);
    pdf.text('Subtotal antes de impuestos', x, y + 5);
    pdf.text(toMoney(subtotalBeforeTax, symbol), x + boxWidth, y + 5, { align: 'right' });
    y += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(95, 95, 95);
  }

  if (doc.tax_enabled) {
    pdf.text(`ITBIS / IVA (${doc.tax_pct || 0}%)`, x, y + 5);
    pdf.text(toMoney(taxAmount, symbol), x + boxWidth, y + 5, { align: 'right' });
    y += 8;
  }

  pdf.setFillColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.roundedRect(x, y, boxWidth, 13, 2, 2, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.text('TOTAL', x + 4, y + 8.5);
  pdf.setFontSize(13);
  pdf.text(toMoney(totalFinal, symbol), x + boxWidth - 4, y + 8.5, { align: 'right' });

  return y + 19;
}

function drawNotes(pdf, { doc, type, y, brandRgb }) {
  const note = doc.notes || (type === 'quote' ? 'Esta cotización es válida por 30 días.' : '');
  const socialDetails = getSocialDetails(doc);
  const width = pdf.internal.pageSize.getWidth() - PAGE.marginX * 2;

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
    pdf.text('Firma autorizada', PAGE.marginX, signatureY + 5);
    pdf.text('Aceptado por cliente', PAGE.marginX + 96, signatureY + 5);
    y = signatureY + 12;
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

export async function generateBillingDocumentPdf({ doc, type, symbol = '$' }) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const meta = getDocMeta(doc, type);
  const brandColor = doc.brand_color || '#D94F8A';
  const brandRgb = hexToRgb(brandColor);
  const logoImage = await loadImageAsDataUrl(doc.logo_url);
  const items = getValidItems(doc);
  const additionalCharges = getAdditionalCharges(doc);
  const additionalChargesTotal = Number(
    doc.additional_charges_total ?? additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0)
  );
  const subtotalBeforeTax = Number(doc.subtotal_before_tax ?? Number(doc.subtotal || 0) + additionalChargesTotal);
  const taxAmount = doc.tax_enabled ? (subtotalBeforeTax * (Number(doc.tax_pct || 0) / 100)) : 0;
  const totalFinal = Number(doc.total_final || 0) || subtotalBeforeTax + taxAmount;
  const contentBottom = () => pdf.internal.pageSize.getHeight() - PAGE.marginBottom - PAGE.footerHeight;

  let y = drawDocumentHeader(pdf, { doc, meta, brandColor, brandRgb, logoImage, isFirstPage: true });
  y = drawTableHeader(pdf, y, brandRgb);

  items.forEach((item, index) => {
    const rowHeight = getRowHeight(pdf, item);
    if (y + rowHeight > contentBottom()) {
      pdf.addPage();
      y = drawDocumentHeader(pdf, { doc, meta, brandColor, brandRgb, logoImage, isFirstPage: false });
      y = drawTableHeader(pdf, y, brandRgb);
    }

    y = drawTableRow(pdf, item, y, index, symbol);
  });

  const noteLines = (doc.notes || type === 'quote') ? 2 : 0;
  const footerHeight = noteLines * 5
    + (doc.doc_show_signature ? 28 : 0)
    + (getSocialDetails(doc).length > 0 ? 12 : 0);
  const totalsHeight = 58 + additionalCharges.length * 8 + footerHeight;
  if (y + totalsHeight > contentBottom()) {
    pdf.addPage();
    y = drawDocumentHeader(pdf, { doc, meta, brandColor, brandRgb, logoImage, isFirstPage: false });
  } else {
    y += 8;
  }

  y = drawTotals(pdf, { doc, taxAmount, totalFinal, symbol, brandRgb, y });
  drawNotes(pdf, { doc, type, y, brandRgb });

  const totalPages = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pdf.setPage(pageNumber);
    drawPageFooter(pdf, pageNumber, totalPages);
  }

  pdf.save(`${meta.label}-${meta.number || 'documento'}.pdf`);
}
