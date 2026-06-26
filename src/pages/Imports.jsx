import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import ColumnMapper from '@/components/imports/ColumnMapper';
import FileDropzone from '@/components/imports/FileDropzone';
import ImportPreviewTable from '@/components/imports/ImportPreviewTable';
import ImportTypeSelector from '@/components/imports/ImportTypeSelector';
import ImportValidationSummary from '@/components/imports/ImportValidationSummary';
import TemplateDownloader from '@/components/imports/TemplateDownloader';
import { buildAutoMapping, getImportType } from '@/lib/importTemplates';
import { parseImportFile } from '@/lib/importParsers';
import { applyColumnMapping, getValidationSummary, validateMappedRows } from '@/lib/importValidators';

export default function Imports() {
  const [typeKey, setTypeKey] = useState('clients');
  const [file, setFile] = useState(null);
  const [parsedFile, setParsedFile] = useState(null);
  const [mapping, setMapping] = useState({});
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  const type = getImportType(typeKey);

  const mappedRows = useMemo(() => {
    if (!parsedFile?.rows) return [];
    return applyColumnMapping(parsedFile.rows, mapping);
  }, [mapping, parsedFile?.rows]);

  const validatedRows = useMemo(
    () => validateMappedRows(typeKey, mappedRows),
    [mappedRows, typeKey]
  );

  const summary = useMemo(
    () => getValidationSummary(validatedRows, parsedFile?.parserErrors || []),
    [parsedFile?.parserErrors, validatedRows]
  );

  const handleTypeChange = (nextType) => {
    setTypeKey(nextType);
    if (parsedFile?.columns?.length) {
      setMapping(buildAutoMapping(nextType, parsedFile.columns));
    } else {
      setMapping({});
    }
  };

  const handleFileSelected = async (nextFile) => {
    if (!nextFile) return;

    setFile(nextFile);
    setParsedFile(null);
    setParseError('');
    setIsParsing(true);

    try {
      const result = await parseImportFile(nextFile);
      setParsedFile(result);
      setMapping(buildAutoMapping(typeKey, result.columns));
      toast.success('Archivo leido correctamente');
    } catch (error) {
      setParseError(error.message || 'No se pudo leer el archivo.');
      toast.error(error.message || 'No se pudo leer el archivo.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Carga archivos Excel o CSV, mapea columnas y valida la informacion antes de guardar datos reales.
        </p>
      </div>

      <Card className="p-4 border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Fase de validacion</p>
            <p className="text-xs text-muted-foreground mt-1">
              Esta pantalla no inserta, actualiza ni elimina datos en Supabase. Solo lee el archivo localmente, mapea columnas y muestra errores basicos.
            </p>
          </div>
        </div>
      </Card>

      <ImportTypeSelector value={typeKey} onChange={handleTypeChange} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <TemplateDownloader typeKey={typeKey} />
          <FileDropzone file={file} onFileSelected={handleFileSelected} isParsing={isParsing} />
        </div>

        <Card className="p-4 h-fit">
          <p className="text-sm font-semibold">Formato esperado</p>
          <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {type.fields.map((field) => (
              <span key={field.key} className={`rounded-full border px-2.5 py-1 text-xs ${field.required ? 'border-primary text-primary' : 'text-muted-foreground'}`}>
                {field.label}{field.required ? ' *' : ''}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {parseError ? (
        <Card className="p-4 border-red-200 bg-red-50 text-red-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">No se pudo leer el archivo</p>
              <p className="text-xs mt-1">{parseError}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {parsedFile ? (
        <>
          <Card className="p-4">
            <p className="text-sm font-semibold">Archivo cargado</p>
            <div className="grid gap-3 sm:grid-cols-4 mt-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Nombre</p>
                <p className="font-medium truncate">{parsedFile.fileName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Tipo</p>
                <p className="font-medium">{parsedFile.fileType}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Hoja</p>
                <p className="font-medium">{parsedFile.sheetName || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Columnas</p>
                <p className="font-medium">{parsedFile.columns.length}</p>
              </div>
            </div>
          </Card>

          <ColumnMapper
            typeKey={typeKey}
            columns={parsedFile.columns}
            mapping={mapping}
            onChange={setMapping}
          />

          <ImportValidationSummary summary={summary} parserErrors={parsedFile.parserErrors || []} />

          <ImportPreviewTable typeKey={typeKey} rows={validatedRows} />
        </>
      ) : null}
    </div>
  );
}
