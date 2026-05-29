import React from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';

export default function BuyButton({ label = 'Comprar CEO Rentable', size = 'lg', className = '' }) {
  const handleClick = () => {
    window.location.href = '/paywall';
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
