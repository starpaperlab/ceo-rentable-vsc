import { DEFAULT_DOCUMENT_PREFS, mapBrandProfileToBusinessConfig } from '@/lib/documentBranding';

export const DEFAULT_BRAND_PROFILE_FORM = {
  name: '',
  legal_name: '',
  logo_url: '',
  brand_color: '#D94F8A',
  fiscal_id: '',
  address: '',
  city_country: '',
  contact_name: '',
  contact_role: '',
  contact_email: '',
  contact_phone: '',
  whatsapp: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  linkedin: '',
  website: '',
  font_family: 'Inter',
  logo_size: 'medium',
  logo_width: 24,
  logo_position: 'left',
  doc_show_socials: DEFAULT_DOCUMENT_PREFS.doc_show_socials,
  doc_show_fiscal_id: DEFAULT_DOCUMENT_PREFS.doc_show_fiscal_id,
  doc_show_address: DEFAULT_DOCUMENT_PREFS.doc_show_address,
  doc_show_contact: DEFAULT_DOCUMENT_PREFS.doc_show_contact,
  doc_show_signature: DEFAULT_DOCUMENT_PREFS.doc_show_signature,
  is_default: false,
};

export function buildBrandProfileForm(profile = {}, { ownerName = '', ownerEmail = '' } = {}) {
  const mapped = mapBrandProfileToBusinessConfig(profile, { ownerName, ownerEmail });

  return {
    ...DEFAULT_BRAND_PROFILE_FORM,
    id: profile.id || null,
    name: profile.name || mapped.business_name || '',
    legal_name: profile.legal_name || mapped.fiscal_name || '',
    logo_url: profile.logo_url || mapped.logo_url || '',
    brand_color: profile.brand_color || mapped.brand_color || DEFAULT_BRAND_PROFILE_FORM.brand_color,
    fiscal_id: profile.fiscal_id || mapped.fiscal_id || '',
    address: profile.address || mapped.address || '',
    city_country: profile.city_country || mapped.city_country || '',
    contact_name: profile.contact_name || mapped.contact_name || ownerName || ownerEmail || '',
    contact_role: profile.contact_role || mapped.contact_title || '',
    contact_email: profile.contact_email || mapped.contact_email || ownerEmail || '',
    contact_phone: profile.contact_phone || mapped.phone_primary || '',
    whatsapp: profile.whatsapp || mapped.whatsapp_url || '',
    instagram: profile.instagram || mapped.instagram_url || '',
    facebook: profile.facebook || mapped.facebook_url || '',
    tiktok: profile.tiktok || mapped.tiktok_url || '',
    linkedin: profile.linkedin || mapped.linkedin_url || '',
    website: profile.website || mapped.website_url || '',
    font_family: profile.font_family || mapped.font_family || DEFAULT_BRAND_PROFILE_FORM.font_family,
    logo_size: profile.logo_settings?.logo_size || mapped.logo_size || DEFAULT_BRAND_PROFILE_FORM.logo_size,
    logo_width: Number(profile.logo_settings?.logo_width || mapped.logo_width || DEFAULT_BRAND_PROFILE_FORM.logo_width),
    logo_position: profile.logo_settings?.logo_position || mapped.logo_position || DEFAULT_BRAND_PROFILE_FORM.logo_position,
    doc_show_socials: profile.pdf_preferences?.doc_show_socials ?? mapped.doc_show_socials ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_socials,
    doc_show_fiscal_id: profile.pdf_preferences?.doc_show_fiscal_id ?? mapped.doc_show_fiscal_id ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_fiscal_id,
    doc_show_address: profile.pdf_preferences?.doc_show_address ?? mapped.doc_show_address ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_address,
    doc_show_contact: profile.pdf_preferences?.doc_show_contact ?? mapped.doc_show_contact ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_contact,
    doc_show_signature: profile.pdf_preferences?.doc_show_signature ?? mapped.doc_show_signature ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_signature,
    is_default: profile.is_default === true,
  };
}

export function serializeBrandProfileForm(raw = {}) {
  return {
    name: `${raw.name || ''}`.trim(),
    legal_name: `${raw.legal_name || ''}`.trim() || null,
    logo_url: `${raw.logo_url || ''}`.trim() || null,
    brand_color: `${raw.brand_color || DEFAULT_BRAND_PROFILE_FORM.brand_color}`.trim(),
    fiscal_id: `${raw.fiscal_id || ''}`.trim() || null,
    address: `${raw.address || ''}`.trim() || null,
    city_country: `${raw.city_country || ''}`.trim() || null,
    contact_name: `${raw.contact_name || ''}`.trim() || null,
    contact_role: `${raw.contact_role || ''}`.trim() || null,
    contact_email: `${raw.contact_email || ''}`.trim().toLowerCase() || null,
    contact_phone: `${raw.contact_phone || ''}`.trim() || null,
    whatsapp: `${raw.whatsapp || ''}`.trim() || null,
    instagram: `${raw.instagram || ''}`.trim() || null,
    facebook: `${raw.facebook || ''}`.trim() || null,
    tiktok: `${raw.tiktok || ''}`.trim() || null,
    linkedin: `${raw.linkedin || ''}`.trim() || null,
    website: `${raw.website || ''}`.trim() || null,
    font_family: `${raw.font_family || DEFAULT_BRAND_PROFILE_FORM.font_family}`.trim(),
    pdf_preferences: {
      doc_show_socials: raw.doc_show_socials ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_socials,
      doc_show_fiscal_id: raw.doc_show_fiscal_id ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_fiscal_id,
      doc_show_address: raw.doc_show_address ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_address,
      doc_show_contact: raw.doc_show_contact ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_contact,
      doc_show_signature: raw.doc_show_signature ?? DEFAULT_BRAND_PROFILE_FORM.doc_show_signature,
    },
    logo_settings: {
      logo_size: raw.logo_size || DEFAULT_BRAND_PROFILE_FORM.logo_size,
      logo_width: Number(raw.logo_width || DEFAULT_BRAND_PROFILE_FORM.logo_width),
      logo_position: raw.logo_position || DEFAULT_BRAND_PROFILE_FORM.logo_position,
    },
    is_default: raw.is_default === true,
  };
}

export function duplicateBrandProfileDraft(profile = {}, { ownerName = '', ownerEmail = '' } = {}) {
  const base = buildBrandProfileForm(profile, { ownerName, ownerEmail });
  return {
    ...base,
    id: null,
    name: base.name ? `${base.name} copia` : 'Nueva marca',
    is_default: false,
  };
}
