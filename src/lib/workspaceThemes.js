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
    preview: ['#71866B', '#B8A98C', '#E2E8DA', '#FAFBF7'],
  },
};

export const DEFAULT_WORKSPACE_THEME = 'ceo_rentable';

export function getWorkspaceTheme(key) {
  return WORKSPACE_THEMES[key] || WORKSPACE_THEMES[DEFAULT_WORKSPACE_THEME];
}

export function getWorkspaceThemeOptions() {
  return Object.values(WORKSPACE_THEMES);
}
