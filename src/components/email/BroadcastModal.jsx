import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import EmailCampaignComposer from '@/components/email/EmailCampaignComposer';

export default function BroadcastModal({ templates, onClose, initialTemplate }) {
  const initialTemplateId = useMemo(() => {
    if (!initialTemplate) return '';
    const match = templates.find(
      (template) => template.id === initialTemplate || template.name === initialTemplate
    );
    return match?.id || '';
  }, [initialTemplate, templates]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl max-h-[92vh] overflow-hidden"
      >
        <Card className="p-5 overflow-y-auto max-h-[92vh]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base">Enviar campaña</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Usa este flujo para envíos a usuarias registradas, correos manuales o listas CSV.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <EmailCampaignComposer
            templates={templates}
            initialTemplateId={initialTemplateId}
            onClose={onClose}
            onSent={() => {}}
          />
        </Card>
      </motion.div>
    </div>
  );
}
