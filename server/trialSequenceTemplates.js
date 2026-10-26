// Prepared only. The diagnostic worker deliberately does not send these steps.
export const trialSequenceTemplates = {
  0: {
    purpose: "service",
    subject: "Bienvenida a tu prueba de CEO Rentable",
    body: "Tu prueba fue activada. Completa la configuración y registra tus primeros productos o servicios con datos reales.",
  },
  2: {
    purpose: "promotional",
    subject: "Calcula tus costos con datos reales",
    body: "Registra los costos directos, el tiempo y los gastos que corresponden a tu negocio. Revisa los cálculos antes de definir precios.",
  },
  4: {
    purpose: "promotional",
    subject: "Revisa tus precios y márgenes",
    body: "Compara tus precios con el costo completo y el margen que necesitas. CEO Rentable te ayuda a organizar esa revisión; no garantiza una ganancia.",
  },
  7: {
    purpose: "promotional",
    subject: "Aprovecha tu prueba de CEO Rentable",
    body: "Revisa tus productos, clientes y cobros pendientes con las herramientas incluidas en tu cuenta.",
  },
  9: {
    purpose: "promotional",
    subject: "Revisa la fecha de finalización de tu prueba",
    body: "Consulta en tu cuenta la fecha real de finalización y las condiciones de la suscripción. Si ya realizaste un pago o tu prueba terminó, este recordatorio no debe enviarse.",
  },
};
export function maySendTrialStep({
  step,
  consent,
  paid,
  cancelled,
  trialEndsAt,
  now = Date.now(),
}) {
  return (
    !paid &&
    !cancelled &&
    Date.parse(trialEndsAt) > now &&
    (step === 0 || consent === true)
  );
}
