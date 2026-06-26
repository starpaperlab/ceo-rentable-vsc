import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { downloadCsvTemplate, downloadXlsxTemplate, getImportType } from '@/lib/importTemplates';
import { Download } from 'lucide-react';

export default function TemplateDownloader({ typeKey }) {
  const type = getImportType(typeKey);

  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Plantilla: {type.label}</p>
          <p className="text-xs text-muted-foreground mt-1">Descarga un formato base antes de preparar tu archivo.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadCsvTemplate(typeKey)}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadXlsxTemplate(typeKey)}>
            <Download className="h-3.5 w-3.5" />
            Excel
          </Button>
        </div>
      </div>
    </Card>
  );
}
