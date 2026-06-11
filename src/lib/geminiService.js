/**
 * ═══════════════════════════════════════════════════════════════
 * CEO RENTABLE OS™ — GEMINI AI SERVICE
 * ═══════════════════════════════════════════════════════════════
 *
 * Servicio para análisis financiero, diagnóstico de negocio y chat
 * usando Google Gemini API
 */

import { ENV_CONFIG } from '@/config/env';

const GEMINI_API_KEY = ENV_CONFIG.gemini.apiKey;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ───────────────────────────────────────────────────────────────
// HELPER: Llamar a Gemini API
// ───────────────────────────────────────────────────────────────

async function callGeminiAPI(prompt, systemContext = '', generationConfigOverrides = {}) {
  if (!GEMINI_API_KEY) {
    console.warn('⚠️ VITE_GEMINI_API_KEY no configurada');
    return {
      success: false,
      error: 'Gemini AI no configurada',
      fallback: true,
    };
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: systemContext + '\n\n' + prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048,
          ...generationConfigOverrides,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Error en Gemini API');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Respuesta vacía de Gemini');
    }

    return {
      success: true,
      text,
      fallback: false,
    };
  } catch (error) {
    console.error('❌ Error Gemini:', error.message);
    return {
      success: false,
      error: error.message,
      fallback: true,
    };
  }
}

// ───────────────────────────────────────────────────────────────
// 1️⃣ ANÁLISIS DE RENTABILIDAD
// ───────────────────────────────────────────────────────────────

/**
 * Analiza la rentabilidad de productos y sugiere mejoras
 * @param {object} data - { products: [], invoices: [] }
 * @returns {object} Análisis y recomendaciones
 */
export async function analyzeProfitability(data) {
  const { products = [], invoices = [] } = data;

  // Calcular métricas básicas
  const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total_ingresos || 0), 0);
  const totalCost = invoices.reduce((sum, inv) => sum + (inv.total_costos || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Productos ordenados por margen
  const topProducts = products
    .sort((a, b) => (b.margin_pct || 0) - (a.margin_pct || 0))
    .slice(0, 3);

  const worstProducts = products
    .filter(p => (p.margin_pct || 0) < 20)
    .sort((a, b) => (a.margin_pct || 0) - (b.margin_pct || 0));

  const prompt = `
Eres un consultor financiero experto en PYMES latinoamericanas.
Analiza estos datos de negocio y proporciona recomendaciones accionables en español.

DATOS DEL NEGOCIO:
- Ingresos totales: $${totalRevenue.toFixed(2)}
- Costos totales: $${totalCost.toFixed(2)}
- Ganancia neta: $${totalProfit.toFixed(2)}
- Margen de ganancia: ${profitMargin.toFixed(1)}%
- Total de ventas: ${invoices.length}
- Total de productos: ${products.length}

PRODUCTOS MÁS RENTABLES:
${topProducts.map(p => `- ${p.name}: ${(p.margin_pct || 0).toFixed(1)}% margen`).join('\n')}

PRODUCTOS CON MARGEN BAJO (<20%):
${worstProducts.length > 0 ? worstProducts.map(p => `- ${p.name}: ${(p.margin_pct || 0).toFixed(1)}% margen`).join('\n') : '- Ninguno'}

ANALIZA Y PROPORCIONA:
1. Evaluación general de la rentabilidad (1 párrafo máximo)
2. 3 productos a potenciar (cuáles y por qué)
3. 2 productos a mejorar o discontinuar
4. 3 acciones concretas para aumentar ganancia en los próximos 30 días

Responde en formato estructurado con emojis. Sé específico y práctico.
  `;

  const result = await callGeminiAPI(prompt);

  if (!result.success && result.fallback) {
    // Fallback: análisis básico sin IA
    return {
      success: true,
      fallback: true,
      summary: {
        totalRevenue,
        totalProfit,
        profitMargin: profitMargin.toFixed(1),
        status: profitMargin > 30 ? 'saludable' : profitMargin > 15 ? 'promedio' : 'crítico',
      },
      recommendations: [
        '📊 Enfocarse en los 3 productos con mayor margen',
        '🔍 Revisar costos de los productos con margen < 20%',
        '💡 Considera ajustar precios o reducir costos',
      ],
    };
  }

  return {
    success: result.success,
    analysis: result.text,
    metrics: {
      totalRevenue,
      totalProfit,
      profitMargin: profitMargin.toFixed(1),
      topProducts: topProducts.map(p => ({ name: p.name, margin: p.margin_pct })),
    },
  };
}

// ───────────────────────────────────────────────────────────────
// 2️⃣ DIAGNÓSTICO DEL NEGOCIO
// ───────────────────────────────────────────────────────────────

const MONTHLY_SALES_LABELS = {
  less_500: 'Menos de RD$30,000 al mes',
  '500_2000': 'Entre RD$30,000 y RD$120,000 al mes',
  more_2000: 'Más de RD$120,000 al mes',
};

/**
 * Clasifica el CEO Score en una etiqueta de salud financiera
 * @param {number} score - Puntuación 0-100
 * @returns {'Crítico'|'Inestable'|'Saludable'}
 */
export function getCeoScoreClassification(score) {
  if (score < 40) return 'Crítico';
  if (score < 70) return 'Inestable';
  return 'Saludable';
}

/**
 * Diagnóstico de respaldo (sin IA) basado en las respuestas reales del diagnóstico
 */
function buildFallbackDiagnosis({ monthly_sales, knows_margin, controls_costs, knows_best_product, ceo_score = 0 }) {
  const classification = getCeoScoreClassification(ceo_score);
  const salesLabel = MONTHLY_SALES_LABELS[monthly_sales] || 'tus ventas mensuales';

  const recommendations = [];
  if (!knows_margin) {
    recommendations.push('📊 Calcula el margen de ganancia real de cada producto o servicio que vendes.');
  }
  if (!controls_costs) {
    recommendations.push('🧾 Registra todos tus costos fijos y variables del mes para tener control real.');
  }
  if (!knows_best_product) {
    recommendations.push('🏆 Identifica qué producto o servicio te deja más ganancia y enfócate en venderlo más.');
  }
  if (recommendations.length < 2) {
    recommendations.push('🎯 Define una meta de ventas mensual y revisa tu avance cada semana.');
  }
  if (recommendations.length < 3) {
    recommendations.push('💡 Separa las finanzas personales de las del negocio si aún no lo haces.');
  }

  return {
    success: true,
    fallback: true,
    diagnosis: `Tu negocio está en un punto ${classification.toLowerCase()} (CEO Score: ${ceo_score}/100), con base en ${salesLabel} y tus respuestas sobre control financiero. Hay oportunidades claras para mejorar tu rentabilidad si tomas acción esta semana.`,
    recommendations: recommendations.slice(0, 3),
  };
}

/**
 * Genera un diagnóstico del negocio basado en las respuestas reales del diagnóstico rápido
 * @param {object} answers - { monthly_sales, knows_margin, controls_costs, knows_best_product, ceo_score }
 * @returns {object} { success, fallback, diagnosis, recommendations }
 */
export async function generateBusinessDiagnosis(answers = {}) {
  const {
    monthly_sales,
    knows_margin = false,
    controls_costs = false,
    knows_best_product = false,
    ceo_score = 0,
  } = answers;

  const classification = getCeoScoreClassification(ceo_score);
  const salesLabel = MONTHLY_SALES_LABELS[monthly_sales] || 'No especificado';

  const prompt = `
Eres un consultor financiero experto en PYMES de LATAM para CEO Rentable OS™.
Una persona emprendedora completó un diagnóstico rápido de 4 preguntas. Estas son sus respuestas reales:

- Ventas mensuales aproximadas: ${salesLabel}
- ¿Conoce su margen de ganancia?: ${knows_margin ? 'Sí' : 'No'}
- ¿Tiene control de sus costos?: ${controls_costs ? 'Sí' : 'No'}
- ¿Sabe qué producto o servicio le deja más dinero?: ${knows_best_product ? 'Sí' : 'No'}
- CEO Score calculado: ${ceo_score}/100 (clasificación: ${classification})

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin texto adicional, sin comentarios) con esta forma exacta:
{
  "diagnosis": "Diagnóstico honesto, motivador y específico de 2-3 frases en español, basado en estas respuestas concretas",
  "recommendations": ["Recomendación accionable 1", "Recomendación accionable 2", "Recomendación accionable 3"]
}

El array "recommendations" debe tener entre 2 y 3 elementos, cada uno una acción concreta y aplicable en los próximos 7-30 días, relacionada directamente con las respuestas anteriores. Inicia cada recomendación con un emoji.
  `;

  const result = await callGeminiAPI(prompt, '', {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        diagnosis: { type: 'string' },
        recommendations: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['diagnosis', 'recommendations'],
    },
  });

  if (!result.success && result.fallback) {
    return buildFallbackDiagnosis(answers);
  }

  try {
    const cleaned = result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(cleaned);

    if (!parsed.diagnosis || !Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
      throw new Error('Formato inesperado en respuesta de Gemini');
    }

    return {
      success: true,
      fallback: false,
      diagnosis: parsed.diagnosis,
      recommendations: parsed.recommendations.slice(0, 3),
      timestamp: new Date().toISOString(),
    };
  } catch (parseError) {
    console.error('❌ Error interpretando respuesta de Gemini:', parseError.message);
    return buildFallbackDiagnosis(answers);
  }
}

// ───────────────────────────────────────────────────────────────
// 3️⃣ SUGERENCIAS DE MEJORA
// ───────────────────────────────────────────────────────────────

/**
 * Proporciona recomendaciones personalizadas basadas en métricas
 * @param {object} metrics - Métricas del negocio
 * @returns {array} Lista de sugerencias prácticas
 */
export async function suggestImprovements(metrics) {
  const {
    profitMargin = 0,
    monthlyGrowth = 0,
    customerCount = 0,
    productCount = 0,
    invoiceCount = 0,
  } = metrics;

  const prompt = `
Basándote en estos KPIs de una empresa pequeña, sugiere 5 mejoras específicas y medibles.

MÉTRICAS:
- Margen de ganancia: ${profitMargin}%
- Crecimiento mensual: ${monthlyGrowth}%
- Clientes activos: ${customerCount}
- Productos/servicios: ${productCount}
- Ventas totales: ${invoiceCount}

FORMATO:
Para cada sugerencia:
- 🎯 [Prioridad: ALTA/MEDIA/BAJA]
- Acción: descripción concreta
- Impacto esperado: % o métrica mensurable
- Plazo: días para implementar

Sé específico. Cada acción debe ser implementable en menos de una semana.
Escribe en español.
  `;

  const result = await callGeminiAPI(prompt);

  if (!result.success && result.fallback) {
    return {
      success: true,
      fallback: true,
      suggestions: [
        '💰 Aumentar precios en 10-15% sin perder clientes',
        '📈 Implementar email marketing + 2 emails/mes a clientes',
        '⏱️ Reducir tiempo de venta en 20% automáticamente',
        '📊 Crear 1 reporte automatizado semanal',
        '🤝 Conseguir 3 clientes recurrentes nuevos',
      ],
    };
  }

  return {
    success: result.success,
    suggestions: result.text.split('\n').filter(s => s.trim()),
  };
}

// ───────────────────────────────────────────────────────────────
// 4️⃣ CHAT CON IA (Asistente General)
// ───────────────────────────────────────────────────────────────

/**
 * Chat general con Luna, asistente de IA
 * @param {string} message - Pregunta del usuario
 * @param {object} context - Contexto de negocio
 * @returns {string} Respuesta de Luna
 */
export async function chatResponse(message, context = {}) {
  if (!message || typeof message !== 'string') {
    return '¿Cuál es tu pregunta? 🤔';
  }

  const systemContext = `
Eres Luna, asistente de IA inteligente para CEO Rentable OS™.
Tu rol es ayudar a emprendedoras con:
- Estrategia de negocio
- Análisis financiero
- Optimización de procesos
- Respuestas a preguntas específicas sobre el app

Contexto del usuario:
- Negocio: ${context.businessName || 'No especificado'}
- Ingresos: $${context.monthlyRevenue || 0}
- Ubicación: ${context.timezone || 'Desconocida'}

Reglas:
- Responde en ESPAÑOL siempre
- Sé concisa: máximo 2 párrafos
- Usa emojis relevantes
- Si no sabes, admítelo y sugiere qué buscar
- Sé motivador pero realista
- Ofrece datos concretos, no generalidades
  `;

  const result = await callGeminiAPI(message, systemContext);

  if (!result.success && result.fallback) {
    // Fallback simple
    const question = message.toLowerCase();
    if (question.includes('precio')) {
      return '💰 Para precios competitivos, analiza a 3 competidores y fija 10-15% más si tu diferenciación lo justifica.';
    }
    if (question.includes('cliente') || question.includes('venta')) {
      return '🎯 Las mejores ventas vienen de referrals. Para cada cliente feliz, pide 2 referencias.';
    }
    if (question.includes('costo') || question.includes('gasto')) {
      return '📊 Incrementa márgenes reduciendo costos: negocia con proveedores, automatiza procesos.';
    }
    return '🤔 Interesante pregunta. Dame más detalles para darte una respuesta más útil.';
  }

  return result.text;
}

export default {
  analyzeProfitability,
  generateBusinessDiagnosis,
  getCeoScoreClassification,
  suggestImprovements,
  chatResponse,
};
