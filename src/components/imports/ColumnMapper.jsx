import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getImportType } from '@/lib/importTemplates';

const NONE_VALUE = '__none__';

export default function ColumnMapper({ typeKey, columns = [], mapping = {}, onChange }) {
  const type = getImportType(typeKey);

  const update = (fieldKey, value) => {
    onChange({
      ...mapping,
      [fieldKey]: value === NONE_VALUE ? '' : value,
    });
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-sm font-semibold">Mapeo de columnas</p>
          <p className="text-xs text-muted-foreground mt-1">Relaciona las columnas detectadas con los campos del sistema.</p>
        </div>
        <p className="text-xs text-muted-foreground">{columns.length} columnas detectadas</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {type.fields.map((field) => (
          <div key={field.key}>
            <Label className="text-xs">
              {field.label}{field.required ? ' *' : ''}
            </Label>
            <Select value={mapping[field.key] || NONE_VALUE} onValueChange={(value) => update(field.key, value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar columna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>No mapear</SelectItem>
                {columns.map((column) => (
                  <SelectItem key={column} value={column}>{column}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </Card>
  );
}
