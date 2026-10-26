// Existing CEO Score weights, evaluated deterministically from the eight declared answers.
export function diagnosticScore(a) {
  return (
    ({ under_30k: 5, "30k_120k": 12, "120k_300k": 20, over_300k: 25 }[
      a.monthly_sales
    ] || 5) +
    (a.knows_margin ? 25 : 0) +
    (a.controls_costs ? 25 : 0) +
    (a.knows_best_product ? 25 : 0)
  );
}
export function diagnosticResult(a) {
  const score = diagnosticScore(a),
    classification =
      score < 40 ? "Crítico" : score < 70 ? "Inestable" : "Saludable";
  const recommendations = [];
  if (!a.knows_margin)
    recommendations.push(
      "Calcula el margen de tus productos o servicios con sus costos reales.",
    );
  if (!a.controls_costs)
    recommendations.push(
      "Registra los costos fijos y variables antes de decidir precios.",
    );
  if (!a.knows_best_product)
    recommendations.push(
      "Compara el margen de cada producto o servicio para identificar el más rentable.",
    );
  if (a.main_problem === "cobros")
    recommendations.push(
      "Organiza las cuentas pendientes y define un seguimiento de cobro.",
    );
  recommendations.push(
    "Revisa periódicamente tus registros y separa las finanzas del negocio de las personales.",
  );
  return {
    success: true,
    fallback: false,
    method: "ceo_score_rules_v1",
    score,
    classification,
    diagnosis: `Tu CEO Score es ${score}/100 (${classification}), calculado con las respuestas que declaraste. Este indicador de control financiero no es una medición de ingresos o ganancias ni una calificación comercial.`,
    profitability: a.knows_margin
      ? "Declaraste que conoces tu margen. Compruébalo con costos e ingresos registrados."
      : "Declaraste que no conoces tu margen. Hace falta calcularlo con datos reales antes de afirmar cuánto ganas.",
    cashflow: a.controls_costs
      ? "Declaraste que controlas tus gastos; revisa también las fechas de cobro y pago."
      : "Declaraste que no controlas todos tus gastos. Organizar esos registros ayudará a evaluar el flujo de caja.",
    recommendations: recommendations.slice(0, 3),
  };
}
