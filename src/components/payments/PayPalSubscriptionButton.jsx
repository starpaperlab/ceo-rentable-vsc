import { useEffect, useMemo, useRef, useState } from 'react';
import { ENV_CONFIG } from '@/config/env';

const SCRIPT_ID = 'paypal-subscription-sdk';

function loadPayPalSdk(clientId) {
  return new Promise((resolve, reject) => {
    if (window.paypal?.Buttons) {
      resolve(window.paypal);
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.paypal), { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar PayPal.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&components=buttons&vault=true&intent=subscription`;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => reject(new Error('No se pudo cargar PayPal.'));
    document.head.appendChild(script);
  });
}

export default function PayPalSubscriptionButton({ plan, disabled = false, onApproved, onError }) {
  const containerRef = useRef(null);
  const buttonsRef = useRef(null);
  const approvedRef = useRef(onApproved);
  const errorRef = useRef(onError);
  const [sdkError, setSdkError] = useState('');
  const clientId = ENV_CONFIG.paypal.clientId;
  const planId = plan?.paypalBillingPlanId || '';
  const ready = useMemo(() => Boolean(clientId && planId && !disabled), [clientId, planId, disabled]);

  useEffect(() => {
    approvedRef.current = onApproved;
  }, [onApproved]);

  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;

    async function renderButtons() {
      if (!ready || !containerRef.current) return;
      setSdkError('');

      try {
        const paypal = await loadPayPalSdk(clientId);
        if (cancelled || !paypal?.Buttons || !containerRef.current) return;

        if (buttonsRef.current?.close) {
          try { await buttonsRef.current.close(); } catch { /* noop */ }
        }

        containerRef.current.innerHTML = '';
        const buttons = paypal.Buttons({
          style: {
            layout: 'vertical',
            shape: 'rect',
            label: 'subscribe',
            height: 46,
          },
          createSubscription(_data, actions) {
            return actions.subscription.create({ plan_id: planId });
          },
          async onApprove(data) {
            if (!data?.subscriptionID) {
              const error = new Error('PayPal no devolvió el identificador de la suscripción.');
              setSdkError(error.message);
              errorRef.current?.(error);
              throw error;
            }

            if (approvedRef.current) {
              await approvedRef.current({
                subscriptionId: data.subscriptionID,
                planCode: plan.code,
              });
            }
          },
          onError(error) {
            const message = error?.message || 'No se pudo iniciar la suscripción con PayPal.';
            setSdkError(message);
            errorRef.current?.(error);
          },
        });

        buttonsRef.current = buttons;
        await buttons.render(containerRef.current);
      } catch (error) {
        if (cancelled) return;
        const message = error?.message || 'No se pudo cargar PayPal.';
        setSdkError(message);
        errorRef.current?.(error);
      }
    }

    renderButtons();

    return () => {
      cancelled = true;
      if (buttonsRef.current?.close) {
        try { buttonsRef.current.close(); } catch { /* noop */ }
      }
    };
  }, [clientId, plan?.code, planId, ready]);

  if (!clientId || !planId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs leading-5 text-amber-800">
        El pago seguro de este plan se habilitará cuando termine la configuración de PayPal.
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs leading-5 text-gray-500">
        Completa y valida tus datos antes de continuar con PayPal.
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} />
      {sdkError && <p className="mt-2 text-xs leading-5 text-red-600">{sdkError}</p>}
    </div>
  );
}
