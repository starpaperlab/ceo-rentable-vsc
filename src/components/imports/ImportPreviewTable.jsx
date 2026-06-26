import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getImportType } from '@/lib/importTemplates';

export default function ImportPreviewTable({ typeKey, rows = [], limit = 50 }) {
  const type = getImportType(typeKey);
  const visibleRows = rows.slice(0, limit);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b">
        <div>
          <p className="text-sm font-semibold">Vista previa</p>
          <p className="text-xs text-muted-foreground">Se muestran hasta {limit} filas. Esta vista no guarda datos.</p>
        </div>
        <Badge variant="outline">{rows.length} filas</Badge>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs w-16">Fila</TableHead>
              <TableHead className="text-xs w-24">Estado</TableHead>
              {type.fields.map((field) => (
                <TableHead key={field.key} className="text-xs min-w-[130px]">{field.label}</TableHead>
              ))}
              <TableHead className="text-xs min-w-[220px]">Validacion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={type.fields.length + 3} className="py-12 text-center text-sm text-muted-foreground">
                  Sube un archivo para ver la vista previa.
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => (
                <TableRow key={row.id} className={row.isValid ? '' : 'bg-red-50/40'}>
                  <TableCell className="text-sm text-muted-foreground">{row.rowNumber}</TableCell>
                  <TableCell>
                    {row.isValid ? (
                      <Badge className="bg-green-100 text-green-700 border-0">Valida</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 border-0">Error</Badge>
                    )}
                  </TableCell>
                  {type.fields.map((field) => (
                    <TableCell key={field.key} className="text-sm max-w-[220px] truncate">
                      {row.mapped?.[field.key] || '-'}
                    </TableCell>
                  ))}
                  <TableCell className="text-xs">
                    {row.errors?.length > 0 ? (
                      <div className="space-y-1 text-red-700">
                        {row.errors.map((error) => <p key={error}>{error}</p>)}
                      </div>
                    ) : row.warnings?.length > 0 ? (
                      <div className="space-y-1 text-amber-700">
                        {row.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sin errores</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
