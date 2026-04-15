import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PreviewModal({ template, onClose }) {
  const [vars, setVars] = useState({
    name: 'María', email: 'maria@ejemplo.com', amount: '97.00',
    login_link: 'https://app.ceorentable.com',
    invite_link: 'https://app.ceorentable.com/login',
    subject_line: 'Noticias de CEO Rentable',
    headline: 'Título del email', body_text: 'Aquí va el contenido del correo.',
    cta_text: 'Ver más', cta_url: 'https://app.ceorentable.com',
    promo_title: '50% OFF', promo_price: '$49', promo_description: 'Descripción de la promo.',
    expiry_date: '31 de marzo',
  });

  const rendered = (str) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, 'g'), v), str || '');

  const htmlSource =
    template?.html_content ||
    template?.html_body ||
    (template?.body ? `<pre style="font-family:Inter,Arial,sans-serif;white-space:pre-wrap;">${template.body}</pre>` : '');

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-3xl max-h-[90vh] flex flex-col">
        <Card className="flex flex-col overflow-hidden max-h-[90vh]">
          <div className="p-5 border-b flex items-center justify-between shrink-0">
            <h3 className="font-bold text-base">Vista Previa — {template.name}</h3>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-col md:flex-row overflow-hidden flex-1">
            <div className="md:w-64 p-4 border-r overflow-y-auto shrink-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Variables de prueba</p>
              <div className="space-y-2">
                {Object.entries(vars).map(([key, value]) => (
                  <div key={key}>
                    <Label className="text-[10px] text-muted-foreground">{`{{${key}}}`}</Label>
                    <Input value={value} onChange={(e) => setVars({ ...vars, [key]: e.target.value })} className="mt-0.5 text-xs h-7 px-2" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground font-semibold mb-1">ASUNTO:</p>
                <p className="text-sm font-medium">{rendered(template.subject)}</p>
              </div>
              <iframe
                srcDoc={rendered(htmlSource)}
                className="w-full rounded border"
                style={{ height: '500px' }}
                title="preview"
              />
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
