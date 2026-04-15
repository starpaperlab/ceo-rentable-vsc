import React from 'react';

export default function StatusSemaphore({ value, thresholds = { red: 15, yellow: 30 } }) {
  let color = 'bg-green-500';
  let label = 'Saludable';
  
  if (value < thresholds.red) {
    color = 'bg-red-500';
    label = 'Crítico';
  } else if (value < thresholds.yellow) {
    color = 'bg-yellow-500';
    label = 'Atención';
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${color} animate-pulse`} />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}