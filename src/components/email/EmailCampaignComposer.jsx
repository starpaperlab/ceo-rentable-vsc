import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, Mail, Send, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { emailService } from '@/services/emailService';
import {
  buildTemplateVariableDefaults,
  EMAIL_AUDIENCE_OPTIONS,
  EMAIL_CAMPAIGN_LIMIT,
  extractTemplateVariableKeys,
  getAudienceLabel,
  parseCsvRecipientsText,
  parseManualRecipients,
} from '@/lib/emailCampaignUtils';

const BRAND_PRIMARY = '#D45387';

export default function EmailCampaignComposer({
  templates = [],
  initialTemplateId = '',
  onClose = null,
  onSent = null,
}) {
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId || '');
  const [segment, setSegment] = useState('all');
  const [manualInput, setManualInput] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvImport, setCsvImport] = useState({
    recipients: [],
    invalidRows: [],
    duplicatesRemoved: 0,
    error: null,
  });
  const [variableDefaults, setVariableDefaults] = useState({});
  const [preview, setPreview] = useState(null);
  const [sendResult, setSendResult] = useState(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates]
  );

  const templateVariableKeys = useMemo(
    () => (selectedTemplate ? extractTemplateVariableKeys(selectedTemplate) : []),
    [selectedTemplate]
  );

  useEffect(() => {
    if (!selectedTemplate) return;
    setVariableDefaults((current) => buildTemplateVariableDefaults(selectedTemplate, current));
  }, [selectedTemplate]);

  const manualRecipients = useMemo(() => parseManualRecipients(manualInput), [manualInput]);
  const importedRecipients = segment === 'manual' ? manualRecipients.recipients : csvImport.recipients;

  const previewMutation = useMutation({
    mutationFn: () =>
      emailService.previewCampaign({
        templateId: selectedTemplateId,
        segment,
        recipients: importedRecipients,
        variableDefaults,
      }),
    onSuccess: (result) => {
      setPreview(result);
      setSendResult(null);
    },
    onError: (error) => {
      toast.error(error.message || 'No se pudo preparar la vista previa.');
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      emailService.sendBulkCampaign({
        templateId: selectedTemplateId,
        segment,
        recipients: importedRecipients,
        variableDefaults,
        campaignName: `Envío ${selectedTemplate?.name || 'email'} - ${new Date().toLocaleDateString('es-DO')}`,
      }),
    onSuccess: (result) => {
      setSendResult(result);
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
      toast.success(`Envío completado: ${result.counts?.sent || 0} entregados.`);
      onSent?.(result);
    },
    onError: (error) => {
      toast.error(error.message || 'No se pudo enviar la campaña.');
    },
  });

  const canPreview =
    Boolean(selectedTemplateId) &&
    (segment === 'manual' || segment === 'csv' ? importedRecipients.length > 0 : true);

  const invalidSummary =
    segment === 'manual'
      ? manualRecipients.invalidEmails
      : csvImport.invalidRows.map((row) => `${row.email || '(vacío)'} · fila ${row.rowNumber}`);

  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseCsvRecipientsText(text);
      setCsvFileName(file.name);
      setCsvImport(parsed);
      setPreview(null);
      setSendResult(null);

      if (parsed.error) {
        toast.error(parsed.error);
        return;
      }

      toast.success(`CSV leído: ${parsed.recipients.length} destinatarios válidos.`);
    } catch (error) {
      toast.error(error.message || 'No se pudo leer el archivo CSV.');
    }
  };

  const updateVariable = (key, value) => {
    setPreview(null);
    setSendResult(null);
    setVariableDefaults((current) => ({
      ...current,
      [key]: value,
    }));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">Envío profesional de emails</h3>
          <p className="text-sm text-muted-foreground">
            Selecciona el template, define la audiencia y confirma el envío después de revisar la vista previa.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold">Template</Label>
            <Select value={selectedTemplateId} onValueChange={(value) => {
              setSelectedTemplateId(value);
              setPreview(null);
              setSendResult(null);
            }}>
              <SelectTrigger className="h-9 mt-1 text-sm">
                <SelectValue placeholder="Selecciona un template..." />
              </SelectTrigger>
              <SelectContent>
                {templates
                  .filter((template) => template.is_active !== false)
                  .map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold">Segmento</Label>
            <Select value={segment} onValueChange={(value) => {
              setSegment(value);
              setPreview(null);
              setSendResult(null);
            }}>
              <SelectTrigger className="h-9 mt-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_AUDIENCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {segment === 'manual' ? (
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Destinatarios manuales</Label>
            <Textarea
              value={manualInput}
              onChange={(event) => {
                setManualInput(event.target.value);
                setPreview(null);
                setSendResult(null);
              }}
              placeholder={'maria@correo.com\nana@correo.com, equipo@negocio.com'}
              className="min-h-[120px] text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{manualRecipients.recipients.length} válidos</Badge>
              <Badge variant="secondary">{manualRecipients.invalidEmails.length} inválidos</Badge>
              <Badge variant="secondary">{manualRecipients.duplicatesRemoved} duplicados removidos</Badge>
            </div>
          </div>
        ) : null}

        {segment === 'csv' ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold">Importar CSV</Label>
              <Input type="file" accept=".csv,text/csv" className="mt-1" onChange={handleCsvUpload} />
            </div>

            {csvFileName ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                <p className="font-medium">{csvFileName}</p>
                <p className="text-muted-foreground mt-1">
                  {csvImport.recipients.length} válidos · {csvImport.invalidRows.length} inválidos · {csvImport.duplicatesRemoved} duplicados removidos
                </p>
                {csvImport.error ? (
                  <p className="text-red-600 mt-1">{csvImport.error}</p>
                ) : (
                  <p className="text-muted-foreground mt-1">
                    Formato soportado: <code>email,name</code> y opcionales <code>plan,amount,login_link,invite_link</code>.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {templateVariableKeys.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-pink-600" />
              <p className="text-sm font-medium">Variables por defecto del template</p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {templateVariableKeys.map((key) => (
                <div key={key}>
                  <Label className="text-xs font-semibold">{`{{${key}}}`}</Label>
                  <Input
                    value={variableDefaults[key] || ''}
                    onChange={(event) => updateVariable(key, event.target.value)}
                    className="h-9 mt-1 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {invalidSummary.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Destinatarios inválidos detectados
            </div>
            <p className="mt-2">Estos correos no se enviarán:</p>
            <div className="mt-2 max-h-28 overflow-y-auto rounded bg-white/70 p-2 text-xs">
              {invalidSummary.slice(0, 20).map((value) => (
                <p key={value}>{value}</p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {onClose ? (
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          ) : null}
          <Button
            style={{ backgroundColor: BRAND_PRIMARY }}
            onClick={() => previewMutation.mutate()}
            disabled={!canPreview || previewMutation.isPending}
          >
            {previewMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Users className="h-4 w-4 mr-2" />}
            Vista previa
          </Button>
        </div>
      </Card>

      {preview ? (
        <Card className="p-4 space-y-4">
          <div className="flex flex-col gap-1">
            <h4 className="text-base font-semibold">Vista previa del envío</h4>
            <p className="text-sm text-muted-foreground">
              Template: <strong>{preview.template?.name}</strong> · Segmento: <strong>{getAudienceLabel(preview.segment)}</strong>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{preview.counts?.valid || 0} destinatarios válidos</Badge>
            <Badge variant="secondary">{preview.counts?.invalid || 0} inválidos</Badge>
            <Badge variant="secondary">{preview.counts?.duplicates_removed || 0} duplicados removidos</Badge>
            <Badge variant="secondary">Límite {EMAIL_CAMPAIGN_LIMIT}</Badge>
          </div>

          {preview.counts?.over_limit ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              El envío supera el límite de seguridad de {EMAIL_CAMPAIGN_LIMIT} destinatarios. Filtra más la audiencia antes de confirmar.
            </div>
          ) : null}

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(preview.recipients || []).slice(0, 12).map((recipient) => (
                  <TableRow key={`${recipient.email}-${recipient.source_type}`}>
                    <TableCell className="text-sm font-medium">{recipient.email}</TableCell>
                    <TableCell className="text-sm">{recipient.name || '—'}</TableCell>
                    <TableCell className="text-sm capitalize">{recipient.source_type}</TableCell>
                    <TableCell className="text-sm">
                      {recipient.confirmed === false ? 'No confirmado' : recipient.has_access ? 'Con acceso' : 'Registrado'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <Button
              style={{ backgroundColor: BRAND_PRIMARY }}
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || preview.counts?.over_limit}
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Confirmar envío
            </Button>
          </div>
        </Card>
      ) : null}

      {sendResult ? (
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h4 className="text-base font-semibold">Resultado del envío</h4>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Enviados</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{sendResult.counts?.sent || 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Fallidos</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{sendResult.counts?.failed || 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-2xl font-bold mt-1">{sendResult.counts?.total || 0}</p>
            </div>
          </div>

          {(sendResult.results || []).some((result) => result.status === 'failed') ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                <Mail className="h-4 w-4" />
                Correos con error
              </div>
              <div className="mt-2 max-h-36 overflow-y-auto space-y-1 text-xs text-red-700">
                {sendResult.results
                  .filter((result) => result.status === 'failed')
                  .slice(0, 20)
                  .map((result) => (
                    <p key={`${result.email}-${result.error}`}>{result.email}: {result.error}</p>
                  ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
