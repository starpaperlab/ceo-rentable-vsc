import React from 'react';
import { AlertCircle, CheckCircle2, CloudOff, Clock3, Loader2 } from 'lucide-react';

const STATUS_META = {
  idle: null,
  pending: {
    label: 'Cambios pendientes',
    icon: Clock3,
    className: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  saving: {
    label: 'Guardando...',
    icon: Loader2,
    className: 'text-sky-700 bg-sky-50 border-sky-200',
    spin: true,
  },
  saved: {
    label: 'Guardado',
    icon: CheckCircle2,
    className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  offline: {
    label: 'Sin conexión, borrador guardado localmente',
    icon: CloudOff,
    className: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  error: {
    label: 'Error al guardar, tu trabajo está seguro en este dispositivo',
    icon: AlertCircle,
    className: 'text-rose-700 bg-rose-50 border-rose-200',
  },
};

export default function AutosaveStatus({ status = 'idle', className = '' }) {
  const meta = STATUS_META[status];
  if (!meta) return null;

  const Icon = meta.icon;

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${meta.className} ${className}`}>
      <Icon className={`h-3.5 w-3.5 ${meta.spin ? 'animate-spin' : ''}`} />
      <span>{meta.label}</span>
    </div>
  );
}

