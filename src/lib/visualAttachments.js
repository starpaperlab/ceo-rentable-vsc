import { supabase } from '@/lib/supabase';

export const DOCUMENT_ATTACHMENT_BUCKET = 'document-attachments';
export const VISUAL_ATTACHMENT_MAX_SIZE_BYTES = 5 * 1024 * 1024;
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

export function sanitizeVisualAttachments(rawAttachments = []) {
  if (!Array.isArray(rawAttachments)) return [];

  const normalized = rawAttachments
    .map((attachment, index) => {
      const id = normalizeAttachmentUrl(attachment?.id) || generateAttachmentId();
      const url = normalizeAttachmentUrl(attachment?.url);
      const storagePath = normalizeAttachmentUrl(attachment?.storage_path);
      const bucket = normalizeAttachmentUrl(attachment?.bucket) || (storagePath || url ? DOCUMENT_ATTACHMENT_BUCKET : '');
      const title = normalizeAttachmentUrl(attachment?.title);
      const description = normalizeAttachmentUrl(attachment?.description);
      const createdAt = normalizeAttachmentUrl(attachment?.created_at) || new Date().toISOString();
      const includeInPdf = attachment?.include_in_pdf !== false;
      const orderCandidate = Number(attachment?.order ?? index + 1);
      const order = Number.isFinite(orderCandidate) && orderCandidate > 0 ? orderCandidate : index + 1;

      return {
        id,
        url,
        storage_path: storagePath,
        bucket,
        title,
        description,
        order,
        include_in_pdf: includeInPdf,
        created_at: createdAt,
      };
    })
    .filter((attachment) => attachment.url || attachment.storage_path);

  return normalized
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return `${a.created_at || ''}`.localeCompare(`${b.created_at || ''}`);
    })
    .map((attachment, index) => ({
      ...attachment,
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
    url: storagePath,
    storage_path: storagePath,
    bucket: DOCUMENT_ATTACHMENT_BUCKET,
    title: normalizeAttachmentUrl(title),
    description: normalizeAttachmentUrl(description),
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
  const path = normalizeAttachmentUrl(attachment?.storage_path || attachment?.url);
  if (!path || path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return;
  }

  const bucket = normalizeAttachmentUrl(attachment?.bucket) || DOCUMENT_ATTACHMENT_BUCKET;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export async function resolveVisualAttachmentUrl(attachment, { expiresIn = 3600 } = {}) {
  if (!attachment) return '';

  const rawUrl = normalizeAttachmentUrl(attachment.resolved_url || attachment.preview_url || attachment.url);
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
