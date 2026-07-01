import jsPDF from 'jspdf';
import { resolveDocumentBranding } from '@/lib/documentBranding';

const PAGE = {
  marginX: 16,
  marginTop: 16,
  marginBottom: 16,
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

function getReceiptMeta(receipt = {}) {
  return receipt.receipt_metadata && typeof receipt.receipt_metadata === 'object'
    ? receipt.receipt_metadata
    : {};
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && `${value}`.trim() !== '') return value;
  }
  return '';
}

function getNumber(...values) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return 0;
}

function formatDate(value) {
  if (!value) return '-';

  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(`${value}`)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(dateValue.getTime())) return `${value}`;

  return dateValue.toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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
    return { width: 0, height: 0 };
  }
}

function getCompanyDetails(doc = {}) {
  return [
    doc.doc_show_fiscal_id !== false && doc.fiscal_id ? `RNC / ID: ${doc.fiscal_id}` : '',
    doc.doc_show_address !== false && (doc.address || doc.fiscal_address) ? (doc.address || doc.fiscal_address) : '',
    doc.doc_show_address !== false && doc.city_country ? doc.city_country : '',
    doc.doc_show_contact !== false && doc.contact_name ? [doc.contact_name, doc.contact_title].filter(Boolean).join(' | ') : '',
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

function buildReceiptData(receipt = {}) {
  const metadata = getReceiptMeta(receipt);
  const invoice = receipt.invoice || {};

  return {
    number: firstValue(metadata.receipt_number, receipt.receipt_number, 'REC-0000'),
    issuedAt: firstValue(metadata.receipt_issued_at, receipt.receipt_issued_at, receipt.created_at),
    clientName: firstValue(metadata.client_name, invoice.client_name, receipt.client_name, 'Sin cliente'),
    clientEmail: firstValue(metadata.client_email, invoice.client_email),
    clientPhone: firstValue(metadata.client_phone, invoice.client_phone),
    invoiceNumber: firstValue(metadata.invoice_number, invoice.invoice_number, '-'),
    invoiceDate: firstValue(metadata.invoice_date, invoice.date),
    amountReceived: getNumber(metadata.amount_paid, receipt.amount),
    paymentMethod: firstValue(metadata.payment_method, receipt.payment_method, '-'),
    referenceNumber: firstValue(metadata.reference_number, receipt.reference_number, '-'),
    balancePrevious: getNumber(metadata.balance_previous),
    amountPaid: getNumber(metadata.amount_paid, receipt.amount),
    balanceAfter: getNumber(metadata.balance_after),
    notes: firstValue(metadata.notes, receipt.notes),
    brandProfileId: firstValue(metadata.brand_profile_id, receipt.brand_profile_id),
    brandingSnapshot: metadata.branding_snapshot || {},
  };
}

function resolveReceiptBranding(receiptData) {
  return resolveDocumentBranding({
    brand_profile_id: receiptData.brandProfileId,
    branding_snapshot: receiptData.brandingSnapshot,
  });
}

function drawHeader(pdf, { brand, receiptData, logoImage, brandRgb, brandColor }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const titleX = pageWidth - PAGE.marginX;
  let y = PAGE.marginTop;

  pdf.setFillColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.roundedRect(PAGE.marginX, y - 4, 36, 2, 1, 1, 'F');

  const logoSize = addLogo(pdf, logoImage, PAGE.marginX, y, brand);
  const companyY = y + (logoSize.height ? logoSize.height + 7 : 4);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.text(brand.company_name || 'Mi Empresa', PAGE.marginX, companyY);

  let detailsY = companyY + 6;
  if (brand.fiscal_name && brand.fiscal_name !== brand.company_name) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(95, 95, 95);
    pdf.text(brand.fiscal_name, PAGE.marginX, detailsY);
    detailsY += 4.8;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(115, 115, 115);
  getCompanyDetails(brand).slice(0, 5).forEach((line) => {
    const lines = pdf.splitTextToSize(line, 84);
    pdf.text(lines, PAGE.marginX, detailsY);
    detailsY += lines.length * 4;
  });

  const titleBg = withAlpha(brandColor, 0.1);
  pdf.setFillColor(titleBg.r, titleBg.g, titleBg.b);
  pdf.roundedRect(pageWidth - PAGE.marginX - 58, y - 3, 58, 18, 3, 3, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.text('RECIBO DE ABONO', pageWidth - PAGE.marginX - 29, y + 7.5, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(95, 95, 95);
  pdf.text(`No. ${receiptData.number || '-'}`, titleX, y + 22, { align: 'right' });
  pdf.setFontSize(10);
  pdf.setTextColor(140, 140, 140);
  pdf.text(`Fecha emision: ${formatDate(receiptData.issuedAt)}`, titleX, y + 29, { align: 'right' });

  return Math.max(detailsY + 8, y + 48);
}

function drawClientBlock(pdf, { receiptData, brandRgb, brandColor, y }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const width = pageWidth - PAGE.marginX * 2;
  const bg = withAlpha(brandColor, 0.09);

  pdf.setFillColor(bg.r, bg.g, bg.b);
  pdf.roundedRect(PAGE.marginX, y, width, 30, 3, 3, 'F');
  pdf.setDrawColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.setLineWidth(0.25);
  pdf.line(PAGE.marginX, y, PAGE.marginX, y + 30);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text('CLIENTE', PAGE.marginX + 4, y + 7);
  pdf.text('FACTURA RELACIONADA', pageWidth - PAGE.marginX - 4, y + 7, { align: 'right' });

  pdf.setFontSize(12);
  pdf.setTextColor(34, 34, 34);
  pdf.text(pdf.splitTextToSize(receiptData.clientName || '-', 96), PAGE.marginX + 4, y + 15);
  pdf.text(`${receiptData.invoiceNumber || '-'}`, pageWidth - PAGE.marginX - 4, y + 15, { align: 'right' });

  const clientContact = [receiptData.clientEmail, receiptData.clientPhone].filter(Boolean).join(' | ');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 90);
  if (clientContact) {
    pdf.text(pdf.splitTextToSize(clientContact, 104), PAGE.marginX + 4, y + 23);
  }
  if (receiptData.invoiceDate) {
    pdf.text(`Fecha factura: ${formatDate(receiptData.invoiceDate)}`, pageWidth - PAGE.marginX - 4, y + 23, { align: 'right' });
  }

  return y + 42;
}

function drawAmountSummary(pdf, { receiptData, symbol, brandRgb, brandColor, y }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const width = pageWidth - PAGE.marginX * 2;
  const leftWidth = 76;
  const rightX = PAGE.marginX + leftWidth + 8;
  const rightWidth = width - leftWidth - 8;

  pdf.setFillColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.roundedRect(PAGE.marginX, y, leftWidth, 37, 3, 3, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text('MONTO RECIBIDO', PAGE.marginX + 5, y + 9);
  pdf.setFontSize(20);
  pdf.text(toMoney(receiptData.amountReceived, symbol), PAGE.marginX + 5, y + 24);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Aplicado a factura ${receiptData.invoiceNumber || '-'}`, PAGE.marginX + 5, y + 32);

  const rightBg = withAlpha(brandColor, 0.07);
  pdf.setFillColor(rightBg.r, rightBg.g, rightBg.b);
  pdf.setDrawColor(232, 226, 221);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(rightX, y, rightWidth, 37, 3, 3, 'FD');

  drawInfoLine(pdf, 'Metodo de pago', receiptData.paymentMethod || '-', rightX + 5, y + 10, rightWidth - 10);
  drawInfoLine(pdf, 'Referencia', receiptData.referenceNumber || '-', rightX + 5, y + 23, rightWidth - 10);

  return y + 49;
}

function drawInfoLine(pdf, label, value, x, y, width) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(label.toUpperCase(), x, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(42, 42, 42);
  pdf.text(pdf.splitTextToSize(`${value || '-'}`, width), x, y + 5);
}

function drawBalanceTable(pdf, { receiptData, symbol, brandRgb, brandColor, y }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const width = pageWidth - PAGE.marginX * 2;
  const rowHeight = 13;
  const rows = [
    ['Balance anterior', receiptData.balancePrevious],
    ['Monto abonado', receiptData.amountPaid],
    ['Balance pendiente', receiptData.balanceAfter],
  ];

  const headerBg = withAlpha(brandColor, 0.11);
  pdf.setFillColor(headerBg.r, headerBg.g, headerBg.b);
  pdf.setDrawColor(232, 226, 221);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(PAGE.marginX, y, width, 12, 2.5, 2.5, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(brandRgb.r, brandRgb.g, brandRgb.b);
  pdf.text('RESUMEN DEL ABONO', PAGE.marginX + 4, y + 7.5);
  y += 12;

  rows.forEach(([label, amount], index) => {
    if (index % 2 === 0) {
      pdf.setFillColor(254, 252, 250);
      pdf.rect(PAGE.marginX, y, width, rowHeight, 'F');
    }

    pdf.setDrawColor(232, 226, 221);
    pdf.line(PAGE.marginX, y + rowHeight, PAGE.marginX + width, y + rowHeight);
    pdf.setFont('helvetica', index === rows.length - 1 ? 'bold' : 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(index === rows.length - 1 ? brandRgb.r : 80, index === rows.length - 1 ? brandRgb.g : 80, index === rows.length - 1 ? brandRgb.b : 80);
    pdf.text(label, PAGE.marginX + 4, y + 8.2);
    pdf.text(toMoney(amount, symbol), PAGE.marginX + width - 4, y + 8.2, { align: 'right' });
    y += rowHeight;
  });

  return y + 10;
}

function drawNotes(pdf, { receiptData, y }) {
  if (!receiptData.notes) return y;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const width = pageWidth - PAGE.marginX * 2;
  const lines = pdf.splitTextToSize(`${receiptData.notes}`, width - 8);
  const height = Math.max(22, lines.length * 4.5 + 14);

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(232, 226, 221);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(PAGE.marginX, y, width, height, 3, 3, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text('NOTAS', PAGE.marginX + 4, y + 7);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(65, 65, 65);
  pdf.text(lines, PAGE.marginX + 4, y + 14);

  return y + height + 8;
}

function drawFooter(pdf, { brand, receiptData }) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const footerY = pageHeight - 11;
  const socialDetails = getSocialDetails(brand);
  const footerText = [
    `Recibo ${receiptData.number || '-'}`,
    ...socialDetails.filter((item) => /instagram|@|https?:\/\/|www\./i.test(item)).slice(0, 2),
  ].filter(Boolean).join(' | ');

  pdf.setFont('helvetica', 'normal');
  pdf.setDrawColor(236, 232, 228);
  pdf.setLineWidth(0.15);
  pdf.line(PAGE.marginX, pageHeight - 17, pageWidth - PAGE.marginX, pageHeight - 17);
  pdf.setFontSize(8);
  pdf.setTextColor(135, 135, 135);
  if (footerText) {
    pdf.text(pdf.splitTextToSize(footerText, 118), PAGE.marginX, footerY);
  }
  pdf.text('Comprobante de abono', pageWidth - PAGE.marginX, footerY, { align: 'right' });
}

function getSafeFileName(value) {
  const name = `${value || 'recibo'}`.trim().replace(/[^\w-]+/g, '-').replace(/-+/g, '-');
  return name || 'recibo';
}

export async function generateReceiptPdf({ receipt, symbol = '$' }) {
  const receiptData = buildReceiptData(receipt);
  const brand = resolveReceiptBranding(receiptData);
  const brandColor = brand.brand_color || '#D94F8A';
  const brandRgb = hexToRgb(brandColor);
  const logoImage = await loadImageAsDataUrl(brand.logo_url);
  const pdf = new jsPDF('p', 'mm', 'a4');

  let y = drawHeader(pdf, { brand, receiptData, logoImage, brandRgb, brandColor });
  y = drawClientBlock(pdf, { receiptData, brandRgb, brandColor, y });
  y = drawAmountSummary(pdf, { receiptData, symbol, brandRgb, brandColor, y });
  y = drawBalanceTable(pdf, { receiptData, symbol, brandRgb, brandColor, y });
  drawNotes(pdf, { receiptData, y });
  drawFooter(pdf, { brand, receiptData });

  pdf.save(`${getSafeFileName(receiptData.number)}.pdf`);
}
