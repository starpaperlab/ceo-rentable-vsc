export const BUSINESS_MODELS = [
  { id: 'products', label: 'Productos', description: 'Fabricas, preparas o vendes productos.' },
  { id: 'services', label: 'Servicios', description: 'Cobras por tu tiempo, conocimiento o atención.' },
  { id: 'both', label: 'Productos y servicios', description: 'Tu negocio combina ambos.' },
];

export const INDUSTRIES = {
  products: [
    ['bakery','Repostería'],['creative_stationery','Papelería creativa'],['personalization','Personalizados / sublimación'],
    ['crafts','Artesanía'],['fashion','Ropa / moda'],['accessories','Accesorios'],['cosmetics','Cosmética / belleza'],
    ['food_beverage','Alimentos y bebidas'],['retail','Tienda / comercio'],['other','Mi negocio no aparece'],
  ],
  services: [
    ['nails','Manicure / uñas'],['hair','Peluquería / estilismo'],['makeup','Maquillaje'],['beauty','Estética / belleza'],
    ['graphic_design','Diseño gráfico'],['interior_design','Diseño de interiores'],['photo_video','Fotografía / video'],
    ['marketing','Marketing / redes sociales'],['consulting','Consultoría / asesoría'],['digital_services','Servicios digitales'],
    ['professional_services','Servicios profesionales'],['education','Educación / cursos'],['other','Mi negocio no aparece'],
  ],
};

export const WORKPLACE_OPTIONS = [
  ['home','Desde mi casa'],['owned_location','Local propio'],['rented_location','Local alquilado'],
  ['shared_space','Espacio compartido'],['client_location','Me desplazo donde mis clientes'],
  ['online','Trabajo completamente online'],['combined','Combinación de varias'],['other','Otro'],
];

const COMMON_EXPENSES = ['Electricidad','Agua','Internet','Teléfono','Alquiler','Limpieza','Transporte'];
const COMMON_EQUIPMENT = ['Computadora','Teléfono'];
const COMMON_SUBSCRIPTIONS = [];

export const INDUSTRY_TEMPLATES = {
  bakery: {
    capacityLabel: '¿Cuántos pedidos aproximadamente haces al mes?',
    materials: ['Harina','Azúcar','Huevos','Mantequilla','Leche','Chocolate','Rellenos','Decoraciones','Cajas','Bases','Cintas','Etiquetas'],
    equipment: ['Horno','Batidora','Nevera / freezer','Utensilios'],
    expenses: [...COMMON_EXPENSES,'Gas'],
  },
  creative_stationery: {
    capacityLabel: '¿Cuántas órdenes aproximadamente produces al mes?',
    materials: ['Papel','Cartulina','Tinta','Vinilo','Laminado','Adhesivos','Encuadernación','Empaques'],
    equipment: ['Impresora','Cricut / Silhouette','Laminadora','Guillotina','Computadora'],
    expenses: [...COMMON_EXPENSES],
    subscriptions: ['Software de diseño'],
  },
  personalization: {
    capacityLabel: '¿Cuántas órdenes aproximadamente produces al mes?',
    materials: ['Vinilo','Papel transfer','Tinta','Sustratos','Adhesivos','Empaques'],
    equipment: ['Impresora','Cricut / Silhouette','Sublimadora','Plancha','Computadora'],
    expenses: [...COMMON_EXPENSES],
    subscriptions: ['Software de diseño'],
  },
  nails: {
    capacityLabel: '¿Cuántas clientas atiendes aproximadamente al mes?',
    materials: ['Esmaltes','Geles','Acrílicos','Tips','Limas','Guantes','Algodón','Removedor','Desechables','Productos de higiene'],
    equipment: ['Lámpara UV','Torno','Herramientas'],
    expenses: [...COMMON_EXPENSES],
  },
  hair: {
    capacityLabel: '¿Cuántas clientas atiendes aproximadamente al mes?',
    materials: ['Shampoo','Tratamientos','Tintes','Productos','Guantes'],
    equipment: ['Secador','Plancha','Blower','Herramientas'],
    expenses: [...COMMON_EXPENSES],
  },
  interior_design: {
    capacityLabel: '¿Cuántos servicios o proyectos realizas aproximadamente al mes?',
    materials: ['Impresiones','Muestras'],
    equipment: ['Computadora'],
    expenses: [...COMMON_EXPENSES,'Renders','Visitas'],
    subscriptions: ['Software 3D','Canva','Adobe'],
  },
  digital_services: {
    capacityLabel: '¿Cuántos servicios o proyectos realizas aproximadamente al mes?',
    materials: [],
    equipment: ['Computadora','Teléfono'],
    expenses: ['Internet','Teléfono'],
    subscriptions: ['ChatGPT','Canva','Adobe','Microsoft 365','Google Workspace','Hosting','Dominios','GitHub','Vercel','Supabase','CRM','Email marketing'],
  },
  consulting: {
    capacityLabel: '¿Cuántos servicios o proyectos realizas aproximadamente al mes?',
    materials: [],
    equipment: COMMON_EQUIPMENT,
    expenses: ['Internet','Teléfono','Transporte'],
    subscriptions: ['Canva','Microsoft 365','Google Workspace','Videollamadas'],
  },
  graphic_design: {
    capacityLabel: '¿Cuántos proyectos aproximadamente realizas al mes?',
    materials: [],
    equipment: ['Computadora','Tableta gráfica','Teléfono'],
    expenses: ['Internet'],
    subscriptions: ['Adobe','Canva','ChatGPT','Hosting','Dominios'],
  },
};

export function industryOptionsFor(model) {
  if (model === 'both') {
    const merged = [...INDUSTRIES.products, ...INDUSTRIES.services];
    return merged.filter((item,index,array)=>array.findIndex(x=>x[0]===item[0])===index);
  }
  return INDUSTRIES[model] || [];
}

export function mergedIndustryTemplate(codes = []) {
  const result = { materials: [], equipment: [], expenses: [], subscriptions: [...COMMON_SUBSCRIPTIONS], capacityLabel: '¿Cuántas órdenes, productos o servicios realizas aproximadamente al mes?' };
  for (const code of codes) {
    const template = INDUSTRY_TEMPLATES[code];
    if (!template) continue;
    result.materials.push(...(template.materials || []));
    result.equipment.push(...(template.equipment || []));
    result.expenses.push(...(template.expenses || []));
    result.subscriptions.push(...(template.subscriptions || []));
    if (template.capacityLabel) result.capacityLabel = template.capacityLabel;
  }
  result.materials = [...new Set(result.materials)];
  result.equipment = [...new Set(result.equipment)];
  result.expenses = [...new Set(result.expenses)];
  result.subscriptions = [...new Set(result.subscriptions)];
  return result;
}

export function setupCompletion(config = {}, counts = {}) {
  const checks = [
    [15, Boolean(config.business_model)],
    [15, Array.isArray(config.industry_codes) && config.industry_codes.length > 0],
    [10, Array.isArray(config.workplace_modes) && config.workplace_modes.length > 0],
    [10, config.work_days_per_week !== null && config.work_days_per_week !== undefined],
    [10, config.work_hours_per_day !== null && config.work_hours_per_day !== undefined],
    [10, Boolean(config.monthly_capacity_unknown) || (config.monthly_capacity !== null && config.monthly_capacity !== undefined)],
    [15, config.personal_income_goal !== null && config.personal_income_goal !== undefined && Number(config.personal_income_goal) >= 0],
    [5, Number(counts.expenses || 0) > 0],
    [5, config.business_model === 'services' || Number(counts.materials || 0) > 0],
    [5, Number(counts.equipment || 0) > 0],
  ];
  return checks.reduce((total,[weight,done])=>total+(done?weight:0),0);
}
