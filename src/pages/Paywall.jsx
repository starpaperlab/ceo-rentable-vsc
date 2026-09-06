import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { isRecurringCheckoutPlan } from '@/lib/checkoutPlans';

export default function Paywall() {
  const [searchParams] = useSearchParams();
  const requestedPlan = searchParams.get('plan');
  const plan = isRecurringCheckoutPlan(requestedPlan) ? requestedPlan : 'annual';

  return <Navigate to={`/checkout?plan=${plan}`} replace />;
}
