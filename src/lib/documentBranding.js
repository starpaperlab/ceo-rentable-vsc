export const DEFAULT_DOCUMENT_PREFS = {
  doc_show_socials: true,
  doc_show_fiscal_id: true,
  doc_show_address: true,
  doc_show_contact: true,
  doc_show_signature: false,
};

const DEFAULT_BRANDING = {
  company_name: 'Mi Empresa',
  logo_url: '',
  logo_size: 'medium',
  logo_width: 24,
  logo_position: 'left',
  brand_color: '#D94F8A',
  font_family: 'Inter',
  fiscal_name: '',
  fiscal_id: '',
  fiscal_address: '',
  contact_name: '',
  contact_title: '',
  contact_email: '',
  phone_primary: '',
  phone_secondary: '',
  address: '',
  city_country: '',
  instagram_url: '',
  facebook_url: '',
  tiktok_url: '',
  linkedin_url: '',
  website_url: '',
  whatsapp_url: '',
  ...DEFAULT_DOCUMENT_PREFS,
};

function isMeaningfulString(value) {
  return typeof value === 'string' ? value.trim().length > 0 : false;
}

function pickString(...values) {
  for (const value of values) {
    if (isMeaningfulString(value)) return value.trim();
  }
  return '';
}

function pickNumber(...values) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue > 0) {
      return numberValue;
    }
  }
  return null;
}

function pickBoolean(...values) {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function normalizeDocumentPreferences(config = {}) {
  return {
    doc_show_socials: pickBoolean(
      config.doc_show_socials,
      config.pdf_preferences?.doc_show_socials,
      config.document_preferences?.doc_show_socials,
      config.document_preferences?.show_socials,
    ),
    doc_show_fiscal_id: pickBoolean(
      config.doc_show_fiscal_id,
      config.pdf_preferences?.doc_show_fiscal_id,
      config.document_preferences?.doc_show_fiscal_id,
      config.document_preferences?.show_fiscal_id,
      config.document_preferences?.show_rnc,
    ),
    doc_show_address: pickBoolean(
      config.doc_show_address,
      config.pdf_preferences?.doc_show_address,
      config.document_preferences?.doc_show_address,
      config.document_preferences?.show_address,
    ),
    doc_show_contact: pickBoolean(
      config.doc_show_contact,
      config.pdf_preferences?.doc_show_contact,
      config.document_preferences?.doc_show_contact,
      config.document_preferences?.show_contact,
    ),
    doc_show_signature: pickBoolean(
      config.doc_show_signature,
      config.pdf_preferences?.doc_show_signature,
      config.document_preferences?.doc_show_signature,
      config.document_preferences?.show_signature,
    ),
  };
}

function normalizeLogoSettings(config = {}) {
  const logoSize = pickString(
    config.logo_size,
    config.logo_settings?.logo_size,
  );
  const logoWidth = pickNumber(
    config.logo_width,
    config.logo_settings?.logo_width,
  );
  const logoPosition = pickString(
    config.logo_position,
    config.logo_settings?.logo_position,
  );

  return {
    logo_size: logoSize,
    logo_width: logoWidth,
    logo_position: logoPosition,
  };
}

function normalizeBusinessConfigSource(config = {}) {
  const logoSettings = normalizeLogoSettings(config);
  const documentPreferences = normalizeDocumentPreferences(config);

  return {
    brand_profile_id: pickString(config.brand_profile_id),
    company_name: pickString(config.business_name),
    logo_url: pickString(config.logo_url),
    logo_size: logoSettings.logo_size,
    logo_width: logoSettings.logo_width,
    logo_position: logoSettings.logo_position,
    brand_color: pickString(config.brand_color),
    font_family: pickString(config.font_family),
    legal_name: pickString(config.fiscal_name),
    fiscal_name: pickString(config.fiscal_name),
    fiscal_id: pickString(config.fiscal_id),
    fiscal_address: pickString(config.fiscal_address, config.address),
    contact_name: pickString(config.contact_name),
    contact_title: pickString(config.contact_title),
    contact_role: pickString(config.contact_title),
    contact_email: pickString(config.contact_email),
    phone_primary: pickString(config.phone_primary),
    phone_secondary: pickString(config.phone_secondary),
    address: pickString(config.fiscal_address, config.address),
    city_country: pickString(config.city_country),
    instagram_url: pickString(config.instagram_url),
    facebook_url: pickString(config.facebook_url),
    tiktok_url: pickString(config.tiktok_url),
    linkedin_url: pickString(config.linkedin_url),
    website_url: pickString(config.website_url),
    whatsapp_url: pickString(config.whatsapp_url),
    ...documentPreferences,
  };
}

function normalizeDocumentSource(config = {}) {
  const logoSettings = normalizeLogoSettings(config);
  const documentPreferences = normalizeDocumentPreferences(config);

  return {
    brand_profile_id: pickString(config.brand_profile_id),
    company_name: pickString(config.company_name, config.business_name),
    logo_url: pickString(config.logo_url),
    logo_size: logoSettings.logo_size,
    logo_width: logoSettings.logo_width,
    logo_position: logoSettings.logo_position,
    brand_color: pickString(config.brand_color),
    font_family: pickString(config.font_family),
    legal_name: pickString(config.legal_name, config.fiscal_name),
    fiscal_name: pickString(config.fiscal_name, config.legal_name),
    fiscal_id: pickString(config.fiscal_id, config.rnc),
    fiscal_address: pickString(config.fiscal_address, config.address),
    contact_name: pickString(config.contact_name),
    contact_title: pickString(config.contact_title, config.contact_role),
    contact_role: pickString(config.contact_role, config.contact_title),
    contact_email: pickString(config.contact_email),
    phone_primary: pickString(config.phone_primary, config.contact_phone, config.whatsapp),
    phone_secondary: pickString(config.phone_secondary, config.contact_phone_secondary),
    address: pickString(config.address, config.fiscal_address),
    city_country: pickString(config.city_country),
    instagram_url: pickString(config.instagram_url, config.instagram, config.social_links?.instagram),
    facebook_url: pickString(config.facebook_url, config.facebook, config.social_links?.facebook),
    tiktok_url: pickString(config.tiktok_url, config.tiktok, config.social_links?.tiktok),
    linkedin_url: pickString(config.linkedin_url, config.linkedin, config.social_links?.linkedin),
    website_url: pickString(config.website_url, config.website, config.social_links?.website),
    whatsapp_url: pickString(config.whatsapp_url, config.whatsapp, config.social_links?.whatsapp),
    ...documentPreferences,
  };
}

function normalizeBrandProfileSource(config = {}) {
  const logoSettings = normalizeLogoSettings(config);
  const documentPreferences = normalizeDocumentPreferences(config);

  return {
    brand_profile_id: pickString(config.id, config.brand_profile_id),
    company_name: pickString(config.name),
    logo_url: pickString(config.logo_url),
    logo_size: logoSettings.logo_size,
    logo_width: logoSettings.logo_width,
    logo_position: logoSettings.logo_position,
    brand_color: pickString(config.brand_color),
    font_family: pickString(config.font_family),
    legal_name: pickString(config.legal_name),
    fiscal_name: pickString(config.legal_name, config.fiscal_name),
    fiscal_id: pickString(config.fiscal_id, config.rnc),
    fiscal_address: pickString(config.address, config.fiscal_address),
    contact_name: pickString(config.contact_name),
    contact_title: pickString(config.contact_role, config.contact_title),
    contact_role: pickString(config.contact_role, config.contact_title),
    contact_email: pickString(config.contact_email),
    phone_primary: pickString(config.contact_phone),
    phone_secondary: pickString(config.contact_phone_secondary),
    address: pickString(config.address, config.fiscal_address),
    city_country: pickString(config.city_country),
    instagram_url: pickString(config.instagram, config.instagram_url),
    facebook_url: pickString(config.facebook, config.facebook_url),
    tiktok_url: pickString(config.tiktok, config.tiktok_url),
    linkedin_url: pickString(config.linkedin, config.linkedin_url),
    website_url: pickString(config.website, config.website_url),
    whatsapp_url: pickString(config.whatsapp, config.whatsapp_url),
    ...documentPreferences,
  };
}

function pickResolvedString(snapshotValue, docValue, ownerValue, defaultValue = '') {
  return pickString(snapshotValue, docValue, ownerValue, defaultValue);
}

function pickResolvedNumber(snapshotValue, docValue, ownerValue, defaultValue) {
  return pickNumber(snapshotValue, docValue, ownerValue, defaultValue) ?? defaultValue;
}

function pickResolvedBoolean(snapshotValue, docValue, ownerValue, defaultValue) {
  return pickBoolean(snapshotValue, docValue, ownerValue, defaultValue) ?? defaultValue;
}

export function resolveDocumentBranding(doc = {}, ownerConfig = null, defaults = DEFAULT_BRANDING) {
  const snapshotSource = normalizeDocumentSource(doc.branding_snapshot || {});
  const docSource = normalizeDocumentSource(doc);
  const ownerSource = normalizeBusinessConfigSource(ownerConfig || {});
  const socialLinks = {
    instagram: pickResolvedString(snapshotSource.instagram_url, docSource.instagram_url, ownerSource.instagram_url, defaults.instagram_url),
    facebook: pickResolvedString(snapshotSource.facebook_url, docSource.facebook_url, ownerSource.facebook_url, defaults.facebook_url),
    tiktok: pickResolvedString(snapshotSource.tiktok_url, docSource.tiktok_url, ownerSource.tiktok_url, defaults.tiktok_url),
    linkedin: pickResolvedString(snapshotSource.linkedin_url, docSource.linkedin_url, ownerSource.linkedin_url, defaults.linkedin_url),
    website: pickResolvedString(snapshotSource.website_url, docSource.website_url, ownerSource.website_url, defaults.website_url),
    whatsapp: pickResolvedString(snapshotSource.whatsapp_url, docSource.whatsapp_url, ownerSource.whatsapp_url, defaults.whatsapp_url),
  };
  const documentPreferences = {
    doc_show_socials: pickResolvedBoolean(snapshotSource.doc_show_socials, docSource.doc_show_socials, ownerSource.doc_show_socials, defaults.doc_show_socials),
    doc_show_fiscal_id: pickResolvedBoolean(snapshotSource.doc_show_fiscal_id, docSource.doc_show_fiscal_id, ownerSource.doc_show_fiscal_id, defaults.doc_show_fiscal_id),
    doc_show_address: pickResolvedBoolean(snapshotSource.doc_show_address, docSource.doc_show_address, ownerSource.doc_show_address, defaults.doc_show_address),
    doc_show_contact: pickResolvedBoolean(snapshotSource.doc_show_contact, docSource.doc_show_contact, ownerSource.doc_show_contact, defaults.doc_show_contact),
    doc_show_signature: pickResolvedBoolean(snapshotSource.doc_show_signature, docSource.doc_show_signature, ownerSource.doc_show_signature, defaults.doc_show_signature),
  };
  const logoSettings = {
    logo_size: pickResolvedString(snapshotSource.logo_size, docSource.logo_size, ownerSource.logo_size, defaults.logo_size),
    logo_width: pickResolvedNumber(snapshotSource.logo_width, docSource.logo_width, ownerSource.logo_width, defaults.logo_width),
    logo_position: pickResolvedString(snapshotSource.logo_position, docSource.logo_position, ownerSource.logo_position, defaults.logo_position),
  };

  return {
    ...doc,
    brand_profile_id: pickResolvedString(snapshotSource.brand_profile_id, docSource.brand_profile_id, ownerSource.brand_profile_id, ''),
    company_name: pickResolvedString(snapshotSource.company_name, docSource.company_name, ownerSource.company_name, defaults.company_name),
    logo_url: pickResolvedString(snapshotSource.logo_url, docSource.logo_url, ownerSource.logo_url, defaults.logo_url),
    logo_size: logoSettings.logo_size,
    logo_width: logoSettings.logo_width,
    logo_position: logoSettings.logo_position,
    brand_color: pickResolvedString(snapshotSource.brand_color, docSource.brand_color, ownerSource.brand_color, defaults.brand_color),
    font_family: pickResolvedString(snapshotSource.font_family, docSource.font_family, ownerSource.font_family, defaults.font_family),
    legal_name: pickResolvedString(snapshotSource.legal_name, docSource.legal_name, ownerSource.legal_name, ''),
    fiscal_name: pickResolvedString(snapshotSource.fiscal_name, docSource.fiscal_name, ownerSource.fiscal_name, defaults.fiscal_name),
    fiscal_id: pickResolvedString(snapshotSource.fiscal_id, docSource.fiscal_id, ownerSource.fiscal_id, defaults.fiscal_id),
    fiscal_address: pickResolvedString(snapshotSource.fiscal_address, docSource.fiscal_address, ownerSource.fiscal_address, defaults.fiscal_address),
    contact_name: pickResolvedString(snapshotSource.contact_name, docSource.contact_name, ownerSource.contact_name, defaults.contact_name),
    contact_title: pickResolvedString(snapshotSource.contact_title, docSource.contact_title, ownerSource.contact_title, defaults.contact_title),
    contact_role: pickResolvedString(snapshotSource.contact_role, docSource.contact_role, ownerSource.contact_role, defaults.contact_title),
    contact_email: pickResolvedString(snapshotSource.contact_email, docSource.contact_email, ownerSource.contact_email, defaults.contact_email),
    phone_primary: pickResolvedString(snapshotSource.phone_primary, docSource.phone_primary, ownerSource.phone_primary, defaults.phone_primary),
    phone_secondary: pickResolvedString(snapshotSource.phone_secondary, docSource.phone_secondary, ownerSource.phone_secondary, defaults.phone_secondary),
    address: pickResolvedString(snapshotSource.address, docSource.address, ownerSource.address, defaults.address),
    city_country: pickResolvedString(snapshotSource.city_country, docSource.city_country, ownerSource.city_country, defaults.city_country),
    instagram_url: socialLinks.instagram,
    facebook_url: socialLinks.facebook,
    tiktok_url: socialLinks.tiktok,
    linkedin_url: socialLinks.linkedin,
    website_url: socialLinks.website,
    whatsapp_url: socialLinks.whatsapp,
    social_links: socialLinks,
    doc_show_socials: documentPreferences.doc_show_socials,
    doc_show_fiscal_id: documentPreferences.doc_show_fiscal_id,
    doc_show_address: documentPreferences.doc_show_address,
    doc_show_contact: documentPreferences.doc_show_contact,
    doc_show_signature: documentPreferences.doc_show_signature,
    document_preferences: documentPreferences,
    pdf_preferences: documentPreferences,
    logo_settings: logoSettings,
  };
}

export { DEFAULT_BRANDING as DEFAULT_DOCUMENT_BRANDING };

export function buildDocumentBrandingSnapshot(source = {}, { brandProfileId = null } = {}) {
  const resolved = resolveDocumentBranding(source);
  const hasExplicitCompanyName =
    isMeaningfulString(source?.company_name) ||
    isMeaningfulString(source?.business_name) ||
    isMeaningfulString(source?.branding_snapshot?.company_name);
  const documentPreferences = {
    doc_show_socials: resolved.doc_show_socials,
    doc_show_fiscal_id: resolved.doc_show_fiscal_id,
    doc_show_address: resolved.doc_show_address,
    doc_show_contact: resolved.doc_show_contact,
    doc_show_signature: resolved.doc_show_signature,
  };
  const socialLinks = {
    instagram: resolved.instagram_url || '',
    facebook: resolved.facebook_url || '',
    tiktok: resolved.tiktok_url || '',
    linkedin: resolved.linkedin_url || '',
    website: resolved.website_url || '',
    whatsapp: resolved.whatsapp_url || '',
  };
  const logoSettings = {
    logo_size: resolved.logo_size || DEFAULT_BRANDING.logo_size,
    logo_width: pickResolvedNumber(resolved.logo_width, null, null, DEFAULT_BRANDING.logo_width),
    logo_position: resolved.logo_position || DEFAULT_BRANDING.logo_position,
  };

  return {
    brand_profile_id: pickString(brandProfileId, resolved.brand_profile_id) || null,
    company_name: hasExplicitCompanyName ? (resolved.company_name || DEFAULT_BRANDING.company_name) : '',
    legal_name: pickString(resolved.legal_name, resolved.fiscal_name),
    logo_url: resolved.logo_url || '',
    rnc: pickString(resolved.fiscal_id),
    fiscal_name: resolved.fiscal_name || '',
    fiscal_id: resolved.fiscal_id || '',
    fiscal_address: pickString(resolved.fiscal_address, resolved.address),
    address: pickString(resolved.address, resolved.fiscal_address),
    city_country: resolved.city_country || '',
    contact_name: resolved.contact_name || '',
    contact_role: pickString(resolved.contact_role, resolved.contact_title),
    contact_title: pickString(resolved.contact_title, resolved.contact_role),
    contact_email: resolved.contact_email || '',
    contact_phone: resolved.phone_primary || '',
    contact_phone_secondary: resolved.phone_secondary || '',
    brand_color: resolved.brand_color || DEFAULT_BRANDING.brand_color,
    font_family: resolved.font_family || DEFAULT_BRANDING.font_family,
    social_links: socialLinks,
    document_preferences: documentPreferences,
    pdf_preferences: documentPreferences,
    logo_settings: logoSettings,
  };
}

export function buildDocumentBrandingFields(source = {}, { brandProfileId = null } = {}) {
  const snapshot = buildDocumentBrandingSnapshot(source, { brandProfileId });

  return {
    brand_profile_id: snapshot.brand_profile_id,
    branding_snapshot: snapshot,
    company_name: snapshot.company_name,
    logo_url: snapshot.logo_url,
    logo_size: snapshot.logo_settings.logo_size,
    logo_width: snapshot.logo_settings.logo_width,
    logo_position: snapshot.logo_settings.logo_position,
    brand_color: snapshot.brand_color,
    font_family: snapshot.font_family,
    fiscal_name: snapshot.fiscal_name || snapshot.legal_name || '',
    fiscal_id: snapshot.fiscal_id || snapshot.rnc || '',
    fiscal_address: snapshot.fiscal_address || snapshot.address || '',
    contact_name: snapshot.contact_name,
    contact_title: snapshot.contact_title || snapshot.contact_role || '',
    contact_email: snapshot.contact_email,
    phone_primary: snapshot.contact_phone,
    phone_secondary: snapshot.contact_phone_secondary,
    address: snapshot.address || snapshot.fiscal_address || '',
    city_country: snapshot.city_country,
    instagram_url: snapshot.social_links.instagram,
    facebook_url: snapshot.social_links.facebook,
    tiktok_url: snapshot.social_links.tiktok,
    linkedin_url: snapshot.social_links.linkedin,
    website_url: snapshot.social_links.website,
    whatsapp_url: snapshot.social_links.whatsapp,
    doc_show_socials: snapshot.document_preferences.doc_show_socials,
    doc_show_fiscal_id: snapshot.document_preferences.doc_show_fiscal_id,
    doc_show_address: snapshot.document_preferences.doc_show_address,
    doc_show_contact: snapshot.document_preferences.doc_show_contact,
    doc_show_signature: snapshot.document_preferences.doc_show_signature,
  };
}

export function mapBrandProfileToBusinessConfig(profile = {}, { ownerName = '', ownerEmail = '' } = {}) {
  const normalized = normalizeBrandProfileSource(profile);
  const documentPreferences = {
    doc_show_socials: normalized.doc_show_socials ?? DEFAULT_DOCUMENT_PREFS.doc_show_socials,
    doc_show_fiscal_id: normalized.doc_show_fiscal_id ?? DEFAULT_DOCUMENT_PREFS.doc_show_fiscal_id,
    doc_show_address: normalized.doc_show_address ?? DEFAULT_DOCUMENT_PREFS.doc_show_address,
    doc_show_contact: normalized.doc_show_contact ?? DEFAULT_DOCUMENT_PREFS.doc_show_contact,
    doc_show_signature: normalized.doc_show_signature ?? DEFAULT_DOCUMENT_PREFS.doc_show_signature,
  };

  return {
    id: profile.id || null,
    brand_profile_id: profile.id || null,
    business_name: normalized.company_name || profile.name || '',
    logo_url: normalized.logo_url,
    brand_color: normalized.brand_color || DEFAULT_BRANDING.brand_color,
    font_family: normalized.font_family || DEFAULT_BRANDING.font_family,
    fiscal_name: normalized.fiscal_name || normalized.legal_name || '',
    fiscal_id: normalized.fiscal_id || '',
    fiscal_address: normalized.fiscal_address || normalized.address || '',
    address: normalized.address || normalized.fiscal_address || '',
    city_country: normalized.city_country || '',
    contact_name: normalized.contact_name || ownerName || ownerEmail || '',
    contact_title: normalized.contact_title || normalized.contact_role || '',
    contact_email: normalized.contact_email || ownerEmail || '',
    phone_primary: normalized.phone_primary || '',
    phone_secondary: normalized.phone_secondary || '',
    instagram_url: normalized.instagram_url || '',
    facebook_url: normalized.facebook_url || '',
    tiktok_url: normalized.tiktok_url || '',
    linkedin_url: normalized.linkedin_url || '',
    website_url: normalized.website_url || '',
    whatsapp_url: normalized.whatsapp_url || '',
    logo_size: normalized.logo_size || DEFAULT_BRANDING.logo_size,
    logo_width: normalized.logo_width || DEFAULT_BRANDING.logo_width,
    logo_position: normalized.logo_position || DEFAULT_BRANDING.logo_position,
    ...documentPreferences,
  };
}
