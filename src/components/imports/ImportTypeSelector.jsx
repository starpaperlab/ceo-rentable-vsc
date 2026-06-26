import React from 'react';
import { Card } from '@/components/ui/card';
import { IMPORT_TYPES } from '@/lib/importTemplates';

export default function ImportTypeSelector({ value, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {Object.entries(IMPORT_TYPES).map(([key, type]) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="text-left"
          >
            <Card className={`p-4 h-full transition-colors ${active ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}>
              <p className="text-sm font-semibold text-foreground">{type.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
