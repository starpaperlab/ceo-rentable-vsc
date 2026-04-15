import React from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';

const PAYMENT_LINK = 'https://buy.stripe.com/14A8wQa635hvdfaf2q4gg00';

export default function BuyButton({ label = 'Comprar CEO Rentable', size = 'lg', className = '' }) {
  const handleClick = () => {
    window.open(PAYMENT_LINK, '_blank');
  };

  return (
    <Button
      size={size}
      className={`bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide ${className}`}
      onClick={handleClick}
    >
      <ShoppingCart className="h-5 w-5 mr-2" />
      Completar compra
    </Button>
  );
}