export const EMAIL_CAMPAIGN_LIMIT = 100;

export const EMAIL_AUDIENCE_OPTIONS = [
  { value: 'all', label: 'Todos los usuarios registrados' },
  { value: 'with_access', label: 'Usuarios con acceso' },
  { value: 'without_access', label: 'Usuarios sin acceso' },
  { value: 'admins', label: 'Admins' },
  { value: 'unconfirmed', label: 'No confirmados' },
  { value: 'manual', label: 'Manual' },
  { value: 'csv', label: 'CSV importado' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const DEFAULT_EMAIL_TEMPLATE_VARIABLES = {
  name: 'Emprendedora',
  full_name: 'Emprendedora',
  email: 'hola@ceorentable.com',
  business_name: 'Tu negocio',
  amount: 'RD$0.00',
  currency: 'DOP',
  plan: 'CEO Rentable OS™',
  login_link: 'https://app.ceorentable.com/login',
  invite_link: 'https://app.ceorentable.com/activar-acceso',
  cta_text: 'Abrir CEO Rentable OS™',
  cta_url: 'https://app.ceorentable.com',
  promo_title: 'Una oportunidad especial para ti',
  promo_price: 'RD$0.00',
  promo_description: 'Queremos ayudarte a avanzar con mayor claridad financiera.',
  expiry_date: 'Próximamente',
  subject_line: 'Actualización importante de CEO Rentable OS™',
  headline: 'Tenemos una actualización para ti',
  body_text: 'Gracias por formar parte de CEO Rentable OS™.',
  support_email: 'hola@ceorentable.com',
};

export function normalizeEmailValue(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

export function isValidEmail(value = '') {
  return EMAIL_REGEX.test(normalizeEmailValue(value));
}

export function extractEmailAddress(raw = '') {
  const value = `${raw || ''}`.trim();
  if (!value) return { email: '', name: '' };

  const angleMatch = value.match(/^(.*?)<([^>]+)>$/);
  if (angleMatch) {
    return {
      name: `${angleMatch[1] || ''}`.replace(/^["']|["']$/g, '').trim(),
      email: normalizeEmailValue(angleMatch[2] || ''),
    };
  }

  return {
    name: '',
    email: normalizeEmailValue(value),
  };
}

export function extractTemplateVariableKeys(template = {}) {
  const configured = Array.isArray(template?.variables)
    ? template.variables.map((item) => `${item || ''}`.trim()).filter(Boolean)
    : [];

  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }

  const content = [
    template?.subject || '',
    template?.body || '',
    template?.text_content || '',
    template?.html_body || '',
    template?.html_content || '',
  ].join(' ');

  const matches = Array.from(content.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)).map((match) => match[1]);
  return Array.from(new Set(matches));
}

export function buildTemplateVariableDefaults(template = {}, currentValues = {}) {
  const variableKeys = extractTemplateVariableKeys(template);
  const next = { ...currentValues };

  variableKeys.forEach((key) => {
    if (next[key] == null || next[key] === '') {
      next[key] = DEFAULT_EMAIL_TEMPLATE_VARIABLES[key] || '';
    }
  });

  return next;
}

export function normalizeTemplateVariables(template = {}, values = {}) {
  const defaults = buildTemplateVariableDefaults(template);
  return {
    ...DEFAULT_EMAIL_TEMPLATE_VARIABLES,
    ...defaults,
    ...values,
  };
}

function dedupeRecipients(recipients = []) {
  const seen = new Set();
  let duplicatesRemoved = 0;

  const uniqueRecipients = recipients.filter((recipient) => {
    const email = normalizeEmailValue(recipient?.email);
    if (!email) return false;
    if (seen.has(email)) {
      duplicatesRemoved += 1;
      return false;
    }
    seen.add(email);
    return true;
  });

  return {
    recipients: uniqueRecipients,
    duplicatesRemoved,
  };
}

export function parseManualRecipients(input = '') {
  const tokens = `${input || ''}`
    .split(/[\n,;]+/g)
    .map((item) => `${item || ''}`.trim())
    .filter(Boolean);

  const validRecipients = [];
  const invalidEmails = [];

  tokens.forEach((token) => {
    const parsed = extractEmailAddress(token);
    if (!isValidEmail(parsed.email)) {
      invalidEmails.push(token);
      return;
    }

    validRecipients.push({
      email: parsed.email,
      name: parsed.name || '',
    });
  });

  const deduped = dedupeRecipients(validRecipients);

  return {
    recipients: deduped.recipients,
    invalidEmails,
    duplicatesRemoved: deduped.duplicatesRemoved,
  };
}

function parseCsvLine(line = '') {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => `${value || ''}`.trim());
}

function normalizeCsvHeader(value = '') {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function parseCsvRecipientsText(text = '') {
  const lines = `${text || ''}`
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      recipients: [],
      invalidRows: [],
      duplicatesRemoved: 0,
      headers: [],
      error: 'El archivo CSV está vacío.',
    };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader);
  const emailIndex = headers.indexOf('email');

  if (emailIndex === -1) {
    return {
      recipients: [],
      invalidRows: [],
      duplicatesRemoved: 0,
      headers,
      error: 'El CSV debe incluir una columna "email".',
    };
  }

  const validRecipients = [];
  const invalidRows = [];

  lines.slice(1).forEach((line, rowIndex) => {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = `${values[index] || ''}`.trim();
    });

    const email = normalizeEmailValue(row.email);
    if (!isValidEmail(email)) {
      invalidRows.push({
        rowNumber: rowIndex + 2,
        raw: line,
        email: row.email || '',
      });
      return;
    }

    validRecipients.push({
      email,
      name: row.name || row.full_name || '',
      plan: row.plan || '',
      amount: row.amount || '',
      login_link: row.login_link || '',
      invite_link: row.invite_link || '',
    });
  });

  const deduped = dedupeRecipients(validRecipients);

  return {
    recipients: deduped.recipients,
    invalidRows,
    duplicatesRemoved: deduped.duplicatesRemoved,
    headers,
    error: null,
  };
}

export function getAudienceLabel(segment = '') {
  return EMAIL_AUDIENCE_OPTIONS.find((option) => option.value === segment)?.label || segment;
}
