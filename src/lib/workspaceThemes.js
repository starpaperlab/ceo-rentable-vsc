export const WORKSPACE_THEMES = {
  ceo_rentable: {
    key: 'ceo_rentable',
    label: 'CEO Rentable',
    description: 'Rosa malva elegante y cálido.',
    primary: '#D45387',
    accent: '#7C3AED',
    sidebar: '#FFF7FA',
    sidebarAccent: '#FCE7F1',
    header: '#FFFDFE',
    canvas: '#FFFFFF',
    card: '#FFFFFF',
    border: '#F1E4EA',
    muted: '#FBF5F8',
    preview: ['#D45387', '#7C3AED', '#FCE7F1', '#FFF7FA'],
  },
  esteric_nude: {
    key: 'esteric_nude',
    label: 'Estéric / Nude',
    description: 'Nude, crema y champagne para marcas delicadas.',
    primary: '#A67C6B',
    accent: '#D7B7A3',
    sidebar: '#F8F1EC',
    sidebarAccent: '#EFE2D8',
    header: '#FCF8F5',
    canvas: '#FFFFFF',
    card: '#FFFFFF',
    border: '#E9DDD5',
    muted: '#F7F0EB',
    preview: ['#A67C6B', '#D7B7A3', '#EFE2D8', '#FCF8F5'],
  },
  business_blue: {
    key: 'business_blue',
    label: 'Business Blue',
    description: 'Azules profesionales y limpios.',
    primary: '#2457A6',
    accent: '#6EA8E6',
    sidebar: '#F2F6FC',
    sidebarAccent: '#DDEAF8',
    header: '#F8FAFD',
    canvas: '#FFFFFF',
    card: '#FFFFFF',
    border: '#DFE7F1',
    muted: '#F3F6FA',
    preview: ['#2457A6', '#6EA8E6', '#DDEAF8', '#F8FAFD'],
  },
  classic_neutral: {
    key: 'classic_neutral',
    label: 'Classic Neutral',
    description: 'Grises, blanco y negro suave.',
    primary: '#3F4650',
    accent: '#8A9099',
    sidebar: '#F5F5F4',
    sidebarAccent: '#E7E5E4',
    header: '#FAFAF9',
    canvas: '#FFFFFF',
    card: '#FFFFFF',
    border: '#E7E5E4',
    muted: '#F5F5F4',
    preview: ['#3F4650', '#8A9099', '#E7E5E4', '#FAFAF9'],
  },
  baby_pink: {
    key: 'baby_pink',
    label: 'Baby Pink',
    description: 'Rosa bebé, blush y lavanda suave.',
    primary: '#E47AA8',
    accent: '#B99AE8',
    sidebar: '#FFF4F8',
    sidebarAccent: '#F9DFEA',
    header: '#FFF9FB',
    canvas: '#FFFFFF',
    card: '#FFFFFF',
    border: '#F0E1E8',
    muted: '#FBF2F6',
    preview: ['#E47AA8', '#B99AE8', '#F9DFEA', '#FFF9FB'],
  },
  sage_natural: {
    key: 'sage_natural',
    label: 'Sage Natural',
    description: 'Salvia, crema y tonos tierra suaves.',
    primary: '#71866B',
    accent: '#B8A98C',
    sidebar: '#F3F5EF',
    sidebarAccent: '#E2E8DA',
    header: '#FAFBF7',
    canvas: '#FFFFFF',
    card: '#FFFFFF',
    border: '#E3E8DF',
    muted: '#F3F5EF',
    preview: ['#71866B', '#B8A98C', '#E2E8DA', '#FAFBF7'],
  },
};

export const CUSTOM_WORKSPACE_THEME = {
  key: 'custom',
  label: 'Personalizado',
  description: 'Ajusta tus colores manualmente.',
  primary: '#D45387',
  accent: '#7C3AED',
  sidebar: '#FFF7FA',
  sidebarAccent: '#FCE7F1',
  header: '#FFFDFE',
  canvas: '#FFFFFF',
  card: '#FFFFFF',
  border: '#E9E5E7',
  muted: '#F7F4F5',
  preview: ['#D45387', '#7C3AED', '#FFFFFF', '#E5E7EB'],
  custom: true,
};

export const DEFAULT_WORKSPACE_THEME = 'ceo_rentable';

export function getWorkspaceTheme(key) {
  if (key === 'custom') return CUSTOM_WORKSPACE_THEME;
  return WORKSPACE_THEMES[key] || WORKSPACE_THEMES[DEFAULT_WORKSPACE_THEME];
}

export function getWorkspaceThemeOptions() {
  return [...Object.values(WORKSPACE_THEMES), CUSTOM_WORKSPACE_THEME];
}

function mixWithWhite(hex, amount = 0.9) {
  const value = `${hex || ''}`.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return '#FFFFFF';
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) => Math.round(channel + (255 - channel) * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function resolveWorkspaceTheme(key, primaryOverride, accentOverride) {
  const theme = getWorkspaceTheme(key);
  if (key !== 'custom') return theme;
  const primary = primaryOverride || theme.primary;
  const accent = accentOverride || theme.accent;
  return {
    ...theme,
    primary,
    accent,
    sidebar: mixWithWhite(primary, 0.93),
    sidebarAccent: mixWithWhite(primary, 0.82),
    header: mixWithWhite(accent, 0.96),
    canvas: '#FFFFFF',
    card: '#FFFFFF',
    border: mixWithWhite(primary, 0.88),
    muted: mixWithWhite(primary, 0.95),
  };
}
