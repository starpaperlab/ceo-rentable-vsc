export const CHECKOUT_TRIAL_DAYS = 21;

const MONTHLY_AMOUNT = 17.99;
const ANNUAL_AMOUNT = 179.00;

const PAYPAL_BILLING_PLAN_IDS = {
  monthly: import.meta.env.VITE_PAYPAL_BILLING_PLAN_MONTHLY_ID || '',
  annual: import.meta.env.VITE_PAYPAL_BILLING_PLAN_ANNUAL_ID || '',
};

const formatUsd = (amount) => Number(amount).toFixed(2).replace(/\.00$/, '');
const annualMonthlyEquivalent = (ANNUAL_AMOUNT / 12).toFixed(2);
const annualSavings = (MONTHLY_AMOUNT * 12 - ANNUAL_AMOUNT).toFixed(2);

export const CHECKOUT_PLANS = {
  monthly: {
    code: 'monthly',
    name: 'Mensual',
    amount: MONTHLY_AMOUNT.toFixed(2),
    currency: 'USD',
    billingLabel: '/mes',
    renewalLabel: `US$${formatUsd(MONTHLY_AMOUNT)}/mes`,
    trialDays: CHECKOUT_TRIAL_DAYS,
    badge: null,
    paypalBillingPlanId: PAYPAL_BILLING_PLAN_IDS.monthly,
  },
  annual: {
    code: 'annual',
    name: 'Anual',
    amount: ANNUAL_AMOUNT.toFixed(2),
    currency: 'USD',
    billingLabel: '/año',
    renewalLabel: `US$${formatUsd(ANNUAL_AMOUNT)}/año`,
    trialDays: CHECKOUT_TRIAL_DAYS,
    badge: 'Mejor valor',
    monthlyEquivalentLabel: `Equivale a US$${annualMonthlyEquivalent}/mes`,
    savingsAmount: annualSavings,
    paypalBillingPlanId: PAYPAL_BILLING_PLAN_IDS.annual,
  },
};

export const CHECKOUT_PLAN_CODES = Object.freeze(Object.keys(CHECKOUT_PLANS));

export function getCheckoutPlan(planCode) {
  return CHECKOUT_PLANS[planCode] || null;
}

export function isRecurringCheckoutPlan(planCode) {
  return CHECKOUT_PLAN_CODES.includes(planCode);
}
