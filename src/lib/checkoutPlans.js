export const CHECKOUT_TRIAL_DAYS = 7;

const PAYPAL_BILLING_PLAN_IDS = {
  monthly: import.meta.env.VITE_PAYPAL_BILLING_PLAN_MONTHLY_ID || '',
  annual: import.meta.env.VITE_PAYPAL_BILLING_PLAN_ANNUAL_ID || '',
};

export const CHECKOUT_PLANS = {
  monthly: {
    code: 'monthly',
    name: 'Mensual',
    amount: '21.00',
    currency: 'USD',
    billingLabel: '/mes',
    renewalLabel: 'US$21/mes',
    trialDays: CHECKOUT_TRIAL_DAYS,
    badge: null,
    paypalBillingPlanId: PAYPAL_BILLING_PLAN_IDS.monthly,
  },
  annual: {
    code: 'annual',
    name: 'Anual',
    amount: '210.00',
    currency: 'USD',
    billingLabel: '/año',
    renewalLabel: 'US$210/año',
    trialDays: CHECKOUT_TRIAL_DAYS,
    badge: '2 meses gratis',
    savingsAmount: '42.00',
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
