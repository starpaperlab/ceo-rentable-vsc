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
  if (`${url}`.startsWith('data:image/')) return url;

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;

    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addLogo(pdf, logoDataUrl, x, y) {
  if (!logoDataUrl) return;

  try {
    pdf.addImage(logoDataUrl, undefined, x, y, 24, 16, undefined, 'FAST');
  } catch {
    // El PDF sigue siendo válido si el logo remoto no permite CORS o usa un formato no soportado.
  }
}

function drawPageFooter(pdf, pageNumber, totalPages) {
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(140, 140, 140);
  pdf.text(`Página ${pageNumber} de ${totalPages}`, width / 2, height - 8, { align: 'center' });
}

function drawDocumentHeader(pdf, { doc, meta, brandColor, brandRgb, logoDataUrl, isFirstPage }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = PAGE.marginTop;

  if (isFirstPage) {
    addLogo(pdf, logoDataUrl, PAGE.marginX, y);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
    pdf.text(doc.company_name || 'Mi Empresa', PAGE.marginX, y + (logoDataUrl ? 23 : 4));

    pdf.setFontSize(24);
    pdf.text(meta.label, pageWidth - PAGE.marginX, y + 6, { align: 'right' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(95, 95, 95);
    pdf.text(`N° ${meta.number || '-'}`, pageWidth - PAGE.marginX, y + 14, { align: 'right' });
    pdf.setFontSize(10);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`Fecha: ${doc.date || '-'}`, pageWidth - PAGE.marginX, y + 21, { align: 'right' });

    y += 34;

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

function drawTotals(pdf, { doc, taxAmount, totalFinal, symbol, brandRgb, y }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const boxWidth = 64;
  const x = pageWidth - PAGE.marginX - boxWidth;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(95, 95, 95);
  pdf.text('Subtotal', x, y + 5);
  pdf.text(toMoney(doc.subtotal || 0, symbol), x + boxWidth, y + 5, { align: 'right' });
  y += 8;

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

function drawNotes(pdf, { doc, type, y }) {
  const note = doc.notes || (type === 'quote' ? 'Esta cotización es válida por 30 días.' : '');
  if (!note) return y;

  const width = pdf.internal.pageSize.getWidth() - PAGE.marginX * 2;
  const lines = pdf.splitTextToSize(note, width);
  pdf.setDrawColor(235, 235, 235);
  pdf.line(PAGE.marginX, y, PAGE.marginX + width, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(150, 150, 150);
  pdf.text(lines, PAGE.marginX, y + 6);

  return y + 6 + lines.length * 4.4;
}

export async function generateBillingDocumentPdf({ doc, type, symbol = '$' }) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const meta = getDocMeta(doc, type);
  const brandColor = doc.brand_color || '#D94F8A';
  const brandRgb = hexToRgb(brandColor);
  const logoDataUrl = await loadImageAsDataUrl(doc.logo_url);
  const items = getValidItems(doc);
  const taxAmount = doc.tax_enabled ? (Number(doc.subtotal || 0) * (Number(doc.tax_pct || 0) / 100)) : 0;
  const totalFinal = Number(doc.total_final || 0) || Number(doc.subtotal || 0) + taxAmount;
  const contentBottom = () => pdf.internal.pageSize.getHeight() - PAGE.marginBottom - PAGE.footerHeight;

  let y = drawDocumentHeader(pdf, { doc, meta, brandColor, brandRgb, logoDataUrl, isFirstPage: true });
  y = drawTableHeader(pdf, y, brandRgb);

  items.forEach((item, index) => {
    const rowHeight = getRowHeight(pdf, item);
    if (y + rowHeight > contentBottom()) {
      pdf.addPage();
      y = drawDocumentHeader(pdf, { doc, meta, brandColor, brandRgb, logoDataUrl, isFirstPage: false });
      y = drawTableHeader(pdf, y, brandRgb);
    }

    y = drawTableRow(pdf, item, y, index, symbol);
  });

  const totalsHeight = 52;
  if (y + totalsHeight > contentBottom()) {
    pdf.addPage();
    y = drawDocumentHeader(pdf, { doc, meta, brandColor, brandRgb, logoDataUrl, isFirstPage: false });
  } else {
    y += 8;
  }

  y = drawTotals(pdf, { doc, taxAmount, totalFinal, symbol, brandRgb, y });
  drawNotes(pdf, { doc, type, y });

  const totalPages = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pdf.setPage(pageNumber);
    drawPageFooter(pdf, pageNumber, totalPages);
  }

  pdf.save(`${meta.label}-${meta.number || 'documento'}.pdf`);
}
