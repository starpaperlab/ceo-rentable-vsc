import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Send, Loader2, Users, Megaphone } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const AUDIENCE_OPTIONS = [
  { value: 'all', label: '👥 Todos los usuarios' },
  { value: 'with_access', label: '✅ Con acceso activo' },
  { value: 'without_access', label: '🔒 Sin acceso' },
  { value: 'admins', label: '🛡 Solo admins' },
];

export default function BroadcastModal({ templates, onClose, initialTemplate }) {
  const [templateName, setTemplateName] = useState(initialTemplate || '')
  const [audience, setAudience] = useState('all')
  const [customVars, setCustomVars] = useState('{}')
  const [preview, setPreview] = useState(null)
  const [step, setStep] = useState('config')

  const previewMutation = useMutation({
    mutationFn: async () => {
      // TODO: Integrar con Supabase Edge Function cuando esté lista
      const { data: users, error } = await supabase
        .from('users')
        .select('email')

      if (error) throw error

      return {
        recipient_count: users.length,
        recipients: users.map((u) => u.email),
      }
    },
    onSuccess: (res) => {
      setPreview(res)
      setStep('confirm')
    },
    onError: (e) => toast.error('Error: ' + e.message),
  })

  const sendMutation = useMutation({
    mutationFn: async () => {
      // TODO: Integrar con emailService.js y Supabase Edge Function
      toast.info('Funcionalidad de broadcast sera habilitada pronto')
      return { sent: 0, failed: 0 }
    },
    onSuccess: () => {
      toast.success('Sistema de broadcast configurado')
      setStep('done')
    },
    onError: (e) => toast.error('Error: ' + e.message),
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-base">Enviar Campaña</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          {step === 'config' && (
            <>
              <div>
                <Label className="text-xs font-semibold">Template</Label>
                <Select value={templateName} onValueChange={setTemplateName}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona un template..." /></SelectTrigger>
                  <SelectContent>
                    {templates.filter(t => t.active).map(t => (
                      <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Audiencia</Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Variables personalizadas (JSON opcional)</Label>
                <Textarea value={customVars} onChange={(e) => setCustomVars(e.target.value)} className="mt-1 font-mono text-xs min-h-24" placeholder={'{\n  "subject_line": "Noticias de marzo"\n}'} />
              </div>
              <Button className="w-full" onClick={() => previewMutation.mutate()} disabled={!templateName || previewMutation.isPending}>
                {previewMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Users className="h-4 w-4 mr-2" />}
                Ver destinatarios →
              </Button>
            </>
          )}

          {step === 'confirm' && preview && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="font-semibold text-amber-800 text-sm">Confirmar envío</p>
                <p className="text-amber-700 text-sm mt-1">Se enviará el email a <strong>{preview.recipient_count} destinatarios</strong>.</p>
              </div>
              <div className="max-h-32 overflow-y-auto bg-muted rounded p-3">
                {preview.recipients?.map(email => (
                  <p key={email} className="text-xs text-muted-foreground">{email}</p>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('config')}>← Volver</Button>
                <Button className="flex-1" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar ahora
                </Button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="font-bold text-lg">¡Campaña enviada!</h3>
              <p className="text-muted-foreground text-sm mt-2">Revisa el historial de emails para ver el resultado.</p>
              <Button className="mt-6" onClick={onClose}>Cerrar</Button>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
