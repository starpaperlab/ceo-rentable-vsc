import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileSpreadsheet, Upload } from 'lucide-react';

export default function FileDropzone({ file, onFileSelected, isParsing = false }) {
  const inputRef = useRef(null);

  return (
    <Card className="p-5">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls,.csv"
        onChange={(event) => onFileSelected(event.target.files?.[0] || null)}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Subir archivo</p>
            <p className="text-xs text-muted-foreground mt-1">Formatos permitidos: .xlsx, .xls y .csv.</p>
            {file ? (
              <p className="text-xs text-primary mt-2">{file.name}</p>
            ) : null}
          </div>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={isParsing} className="gap-2">
          <Upload className="h-4 w-4" />
          {isParsing ? 'Leyendo...' : 'Seleccionar archivo'}
        </Button>
      </div>
    </Card>
  );
}
