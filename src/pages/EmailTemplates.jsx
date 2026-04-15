import React, { useState } from 'react';
import { emailService } from '@/services/emailService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Edit, Eye, Send, Loader2, Plus, RefreshCw, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import PreviewModal from '@/components/email/PreviewModal';
import EditTemplateModal from '@/components/email/EditTemplateModal';
import BroadcastModal from '@/components/email/BroadcastModal';
import { useAuth } from '@/lib/AuthContext';

export default function EmailTemplates() {
  const { isAdmin } = useAuth();
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastTemplate, setBroadcastTemplate] = useState(null);
  const [initializing, setInitializing] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => emailService.getAllTemplates(),
    enabled: isAdmin?.() === true,
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => id
      ? emailService.updateTemplate(id, data)
      : emailService.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setEditingTemplate(null);
      setIsNewTemplate(false);
      toast.success('Template guardado');
    },
  });

  const handleInitialize = async () => {
    setInitializing(true);
    try {
      await emailService.initializeTemplates();
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Templates inicializados');
    } catch (e) {
      toast.error('Error: ' + (e.message || 'No se pudo inicializar'));
    } finally {
      setInitializing(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAdmin?.()) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className="p-6 text-center">
          <h2 className="text-lg font-semibold">Acceso restringido</h2>
          <p className="text-sm text-muted-foreground mt-2">Solo cuentas administradoras pueden gestionar templates.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plantillas de Email</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestiona y envía campañas de email a tus usuarios.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleInitialize} disabled={initializing}>
            {initializing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Inicializar templates
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setIsNewTemplate(true); setEditingTemplate({}); }}>
            <Plus className="h-4 w-4 mr-2" /> Nuevo template
          </Button>
          <Button size="sm" onClick={() => { setBroadcastTemplate(null); setShowBroadcast(true); }} disabled={templates.length === 0}>
            <Megaphone className="h-4 w-4 mr-2" /> Enviar campaña
          </Button>
        </div>
      </motion.div>

      {templates.length === 0 ? (
        <Card className="p-12 text-center">
          <Mail className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="font-semibold text-foreground">Sin templates</h3>
          <p className="text-sm text-muted-foreground mt-2 mb-6">Inicializa los templates predefinidos o crea uno nuevo.</p>
          <Button onClick={handleInitialize} disabled={initializing}>
            {initializing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Inicializar templates predefinidos
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="h-4 w-4 text-primary shrink-0" />
                    <p className="font-semibold text-sm truncate">{template.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{template.subject}</p>
                </div>
                <Badge className={template.is_active ? 'bg-green-100 text-green-700 border-green-200 shrink-0 ml-2' : 'bg-gray-100 text-gray-600 shrink-0 ml-2'}>
                  {template.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setPreviewTemplate(template)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> Vista previa
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => { setIsNewTemplate(false); setEditingTemplate(template); }}>
                  <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                </Button>
                <Button size="sm" className="flex-1 text-xs" onClick={() => { setBroadcastTemplate(template.name); setShowBroadcast(true); }}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Enviar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editingTemplate !== null && (
          <EditTemplateModal
            template={editingTemplate}
            isNew={isNewTemplate}
            onClose={() => { setEditingTemplate(null); setIsNewTemplate(false); }}
            onSave={(data) => saveMutation.mutate({ id: isNewTemplate ? null : editingTemplate.id, data })}
          />
        )}
        {previewTemplate && <PreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />}
        {showBroadcast && (
          <BroadcastModal
            templates={templates}
            onClose={() => { setShowBroadcast(false); setBroadcastTemplate(null); }}
            initialTemplate={broadcastTemplate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
