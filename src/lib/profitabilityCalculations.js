const VALID_PRODUCT_TYPES = new Set(['fisico', 'digital', 'servicio']);

function toSafeNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProductType(value) {
  const normalized = `${value || 'fisico'}`.trim().toLowerCase();
  return VALID_PRODUCT_TYPES.has(normalized) ? normalized : 'fisico';
}

export function calculateProfitability({
  price,
  materials,
  materialsCost,
  hidden,
  additionalCost,
  ads,
  adsCost,
  time,
  hours,
  hourly,
  hourlyRate,
  laborCost,
  commission,
  commissionPct,
  targetMargin = 40,
  productType = 'fisico',
} = {}) {
  normalizeProductType(productType);

  const normalizedPrice = toSafeNumber(price);
  const normalizedMaterialsCost = toSafeNumber(materialsCost ?? materials);
  const normalizedAdditionalCost = toSafeNumber(additionalCost ?? hidden);
  const normalizedAdsCost = toSafeNumber(adsCost ?? ads);
  const normalizedHours = toSafeNumber(hours ?? time);
  const normalizedHourlyRate = toSafeNumber(hourlyRate ?? hourly);
  const normalizedLaborCost = laborCost == null ? null : toSafeNumber(laborCost);
  const normalizedCommissionPct = toSafeNumber(commissionPct ?? commission);
  const normalizedTargetMargin = toSafeNumber(targetMargin);

  const computedLaborCost = normalizedLaborCost == null ? normalizedHours * normalizedHourlyRate : normalizedLaborCost;
  const operationalCost = normalizedMaterialsCost + normalizedAdditionalCost + normalizedAdsCost + computedLaborCost;
  const commissionCost = normalizedPrice * (normalizedCommissionPct / 100);
  const totalCost = operationalCost + commissionCost;
  const profit = normalizedPrice - totalCost;
  const margin = normalizedPrice > 0 ? ((profit / normalizedPrice) * 100) : 0;
  const breakEvenUnits = profit > 0 ? Math.ceil(totalCost / profit) : 0;
  const recommendedPrice = normalizedTargetMargin >= 100
    ? 0
    : (totalCost <= 0 ? 0 : totalCost / (1 - (normalizedTargetMargin / 100)));

  return {
    price: normalizedPrice,
    materialsCost: normalizedMaterialsCost,
    additionalCost: normalizedAdditionalCost,
    adsCost: normalizedAdsCost,
    laborCost: computedLaborCost,
    operationalCost,
    commissionCost,
    totalCost,
    profit,
    margin,
    breakEvenUnits,
    recommendedPrice,
  };
}
