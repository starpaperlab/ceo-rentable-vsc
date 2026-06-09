import { supabase } from '@/lib/supabase';

export const DOCUMENT_ATTACHMENT_BUCKET = 'document-attachments';
export const VISUAL_ATTACHMENT_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const COMMERCIAL_ATTACHMENT_FILE_TYPES = {
  IMAGE: 'image',
  PDF: 'pdf',
};
export const COMMERCIAL_ATTACHMENT_LAYOUTS = {
  PREMIUM: 'premium',
  GALLERY_2: 'gallery_2',
  GALLERY_4: 'gallery_4',
};
export const DEFAULT_COMMERCIAL_ATTACHMENT_LAYOUT = COMMERCIAL_ATTACHMENT_LAYOUTS.PREMIUM;
export const VISUAL_ATTACHMENT_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const VISUAL_ATTACHMENT_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function isMeaningfulString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toSafeId(value = '') {
  return `${value || ''}`.replace(/[^\w.-]/g, '_');
}

export function generateAttachmentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAttachmentUrl(value = '') {
  return isMeaningfulString(value) ? value.trim() : '';
}

export function sanitizeCommercialAttachmentLayout(value) {
  const normalized = normalizeAttachmentUrl(value).toLowerCase();
  if (normalized === COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_2) return COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_2;
  if (normalized === COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_4) return COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_4;
  return DEFAULT_COMMERCIAL_ATTACHMENT_LAYOUT;
}

export function getCommercialAttachmentLayoutLabel(value) {
  const layout = sanitizeCommercialAttachmentLayout(value);
  if (layout === COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_2) return 'Galería 2 imágenes por página';
  if (layout === COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_4) return 'Galería 4 imágenes por página';
  return 'Presentación Premium (1 imagen por página)';
}

function sanitizeCommercialAttachmentFileType(value) {
  const normalized = normalizeAttachmentUrl(value).toLowerCase();
  if (normalized === COMMERCIAL_ATTACHMENT_FILE_TYPES.PDF) {
    return COMMERCIAL_ATTACHMENT_FILE_TYPES.PDF;
  }
  return COMMERCIAL_ATTACHMENT_FILE_TYPES.IMAGE;
}

export function sanitizeVisualAttachments(rawAttachments = []) {
  if (!Array.isArray(rawAttachments)) return [];

  const normalized = rawAttachments
    .map((attachment, index) => {
      const id = normalizeAttachmentUrl(attachment?.id) || generateAttachmentId();
      const fileUrl = normalizeAttachmentUrl(
        attachment?.file_url || attachment?.storage_path || attachment?.url
      );
      const storagePath = normalizeAttachmentUrl(attachment?.storage_path || fileUrl);
      const bucket = normalizeAttachmentUrl(attachment?.bucket) || (storagePath || fileUrl ? DOCUMENT_ATTACHMENT_BUCKET : '');
      const title = normalizeAttachmentUrl(attachment?.title);
      const description = normalizeAttachmentUrl(attachment?.description);
      const createdAt = normalizeAttachmentUrl(attachment?.created_at) || new Date().toISOString();
      const includeInPdf = attachment?.include_in_pdf !== false;
      const sortOrderCandidate = Number(attachment?.sort_order ?? attachment?.order ?? index + 1);
      const sortOrder = Number.isFinite(sortOrderCandidate) && sortOrderCandidate > 0 ? sortOrderCandidate : index + 1;
      const fileType = sanitizeCommercialAttachmentFileType(attachment?.file_type);

      return {
        id,
        file_url: fileUrl,
        url: fileUrl,
        storage_path: storagePath,
        bucket,
        file_type: fileType,
        title,
        description,
        sort_order: sortOrder,
        order: sortOrder,
        include_in_pdf: includeInPdf,
        created_at: createdAt,
      };
    })
    .filter((attachment) => attachment.file_url || attachment.storage_path);

  return normalized
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return `${a.created_at || ''}`.localeCompare(`${b.created_at || ''}`);
    })
    .map((attachment, index) => ({
      ...attachment,
      file_url: attachment.file_url || attachment.storage_path || attachment.url || '',
      file_type: sanitizeCommercialAttachmentFileType(attachment.file_type),
      sort_order: index + 1,
      order: index + 1,
    }));
}

export function buildVisualAttachmentRecord({
  id = generateAttachmentId(),
  path = '',
  title = '',
  description = '',
  includeInPdf = true,
  createdAt = new Date().toISOString(),
}) {
  const storagePath = normalizeAttachmentUrl(path);

  return {
    id,
    file_url: storagePath,
    url: storagePath,
    storage_path: storagePath,
    bucket: DOCUMENT_ATTACHMENT_BUCKET,
    file_type: COMMERCIAL_ATTACHMENT_FILE_TYPES.IMAGE,
    title: normalizeAttachmentUrl(title),
    description: normalizeAttachmentUrl(description),
    sort_order: 1,
    order: 1,
    include_in_pdf: includeInPdf,
    created_at: createdAt,
  };
}

export function validateVisualAttachmentFile(file) {
  if (!file) {
    throw new Error('No encontramos el archivo seleccionado.');
  }

  const type = `${file.type || ''}`.toLowerCase();
  const name = `${file.name || ''}`.toLowerCase();
  const hasValidExtension = VISUAL_ATTACHMENT_ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension));

  if (!VISUAL_ATTACHMENT_ALLOWED_TYPES.has(type) && !hasValidExtension) {
    throw new Error('Solo se permiten imágenes JPG, PNG o WebP.');
  }

  if (Number(file.size || 0) > VISUAL_ATTACHMENT_MAX_SIZE_BYTES) {
    throw new Error('Cada imagen debe pesar máximo 5MB.');
  }

  return true;
}

export function getVisualAttachmentStoragePath({
  ownerRef,
  documentRef,
  attachmentId,
  fileName,
}) {
  const safeOwner = toSafeId(ownerRef || 'anon');
  const safeDocument = toSafeId(documentRef || 'draft');
  const safeAttachmentId = toSafeId(attachmentId || generateAttachmentId());
  const safeName = toSafeId(fileName || 'archivo');
  return `${safeOwner}/${safeDocument}/${safeAttachmentId}-${safeName}`;
}

export async function uploadVisualAttachment({
  file,
  ownerRef,
  documentRef,
  attachmentId = generateAttachmentId(),
}) {
  validateVisualAttachmentFile(file);

  const path = getVisualAttachmentStoragePath({
    ownerRef,
    documentRef,
    attachmentId,
    fileName: file.name,
  });

  const { error } = await supabase.storage
    .from(DOCUMENT_ATTACHMENT_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) throw error;

  return buildVisualAttachmentRecord({
    id: attachmentId,
    path,
  });
}

export async function deleteVisualAttachmentFile(attachment) {
  const path = normalizeAttachmentUrl(attachment?.storage_path || attachment?.file_url || attachment?.url);
  if (!path || path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return;
  }

  const bucket = normalizeAttachmentUrl(attachment?.bucket) || DOCUMENT_ATTACHMENT_BUCKET;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export async function resolveVisualAttachmentUrl(attachment, { expiresIn = 3600 } = {}) {
  if (!attachment) return '';

  const rawUrl = normalizeAttachmentUrl(
    attachment.resolved_url || attachment.preview_url || attachment.file_url || attachment.url
  );
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return rawUrl;
  }

  const storagePath = normalizeAttachmentUrl(attachment.storage_path || rawUrl);
  if (!storagePath) return '';

  const bucket = normalizeAttachmentUrl(attachment.bucket) || DOCUMENT_ATTACHMENT_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data?.signedUrl || '';
}

export async function resolveVisualAttachmentsForDisplay(rawAttachments = [], options = {}) {
  const attachments = sanitizeVisualAttachments(rawAttachments);

  return Promise.all(
    attachments.map(async (attachment) => {
      try {
        const resolvedUrl = await resolveVisualAttachmentUrl(attachment, options);
        return {
          ...attachment,
          resolved_url: resolvedUrl,
        };
      } catch {
        return {
          ...attachment,
          resolved_url: '',
        };
      }
    })
  );
}

export function chunkCommercialAttachments(rawAttachments = [], layout = DEFAULT_COMMERCIAL_ATTACHMENT_LAYOUT) {
  const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];
  const safeLayout = sanitizeCommercialAttachmentLayout(layout);
  const chunkSize = safeLayout === COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_4
    ? 4
    : safeLayout === COMMERCIAL_ATTACHMENT_LAYOUTS.GALLERY_2
      ? 2
      : 1;

  const chunks = [];
  for (let index = 0; index < attachments.length; index += chunkSize) {
    chunks.push(attachments.slice(index, index + chunkSize));
  }
  return chunks;
}
