import React from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { getCheckoutPath } from '@/lib/pendingCheckout';
import { trackInitiateCheckout } from '@/lib/metaPixel';

export default function BuyButton({
  label = 'Comprar CEO Rentable',
  size = 'lg',
  className = '',
  plan = null,
  checkout = false,
  value = null,
  currency = null,
}) {
  const handleClick = () => {
    if (plan) {
      trackInitiateCheckout({ plan, value, currency });
    }

    window.location.href = plan ? getCheckoutPath(plan, checkout ? { checkout: true } : {}) : '/paywall';
  };

  return (
    <Button
      size={size}
      className={`bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide ${className}`}
      onClick={handleClick}
    >
      <ShoppingCart className="h-5 w-5 mr-2" />
      {label}
    </Button>
  );
}
