export const CHECKOUT_TRIAL_DAYS = 21;

const PAYPAL_BILLING_PLAN_IDS = {
  monthly: import.meta.env.VITE_PAYPAL_BILLING_PLAN_MONTHLY_ID || '',
  annual: import.meta.env.VITE_PAYPAL_BILLING_PLAN_ANNUAL_ID || '',
};

export const CHECKOUT_PLANS = {
  monthly: {
    code: 'monthly',
    name: 'Mensual',
    amount: '17.99',
    currency: 'USD',
    billingLabel: '/mes',
    renewalLabel: 'US$17.99/mes',
    trialDays: CHECKOUT_TRIAL_DAYS,
    badge: null,
    paypalBillingPlanId: PAYPAL_BILLING_PLAN_IDS.monthly,
  },
  annual: {
    code: 'annual',
    name: 'Anual',
    amount: '179.00',
    currency: 'USD',
    billingLabel: '/año',
    renewalLabel: 'US$179/año',
    trialDays: CHECKOUT_TRIAL_DAYS,
    badge: 'Mejor valor',
    savingsAmount: '36.88',
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
