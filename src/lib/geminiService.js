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

async function callGeminiAPI(prompt, systemContext = '') {
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

/**
 * Genera un diagnóstico completo del negocio basado en preguntas
 * @param {object} answers - Respuestas del usuario a preguntas clave
 * @returns {object} Diagnóstico con puntuación y recomendaciones
 */
export async function generateBusinessDiagnosis(answers) {
  const {
    businessName = 'Mi Negocio',
    businessType = 'servicios',
    monthlyRevenue = 0,
    employees = 0,
    primaryChallenges = [],
    goals = [],
  } = answers;

  const prompt = `
Eres un consultor estratégico para emprendedoras en LATAM.
Genera un diagnóstico profesional basado en esta información.

INFORMACIÓN DEL NEGOCIO:
- Nombre: ${businessName}
- Tipo: ${businessType}
- Ingresos mensuales: $${monthlyRevenue}
- Empleados: ${employees}
- Desafíos principales: ${primaryChallenges.join(', ') || 'No especificados'}
- Metas para los próximos 6 meses: ${goals.join(', ') || 'No especificadas'}

PROPORCIONA:
1. **Diagnóstico**: Evaluación honesta del estado actual del negocio (2 párrafos)
2. **Fortalezas**: 3 aspectos positivos identificados
3. **Oportunidades de mejora**: 3 áreas críticas a trabajar
4. **Plan de acción 30 días**: 5 pasos prácticos e inmediatos
5. **Puntuación de madurez**: 1-10 (siendo 10 completamente optimizado)

Usa emojis y sé motivador pero realista. Escribe en español.
  `;

  const result = await callGeminiAPI(prompt);

  if (!result.success && result.fallback) {
    return {
      success: true,
      fallback: true,
      diagnosis: 'Diagnóstico genérico disponible',
      score: 5,
      actions: [
        '📊 Documenta tus ingresos y gastos diarios',
        '🎯 Define 3 metas claras para los próximos 90 días',
        '💼 Implementa un CRM simple para clientes',
      ],
    };
  }

  return {
    success: result.success,
    diagnosis: result.text,
    timestamp: new Date().toISOString(),
  };
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
  suggestImprovements,
  chatResponse,
};
