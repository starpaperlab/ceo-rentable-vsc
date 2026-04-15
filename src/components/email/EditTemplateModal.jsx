import React, { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import GrapesEditor from './GrapesEditor';

export default function EditTemplateModal({ template, isNew, onClose, onSave }) {
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [step, setStep] = useState('meta'); // 'meta' | 'editor'
  const editorRef = useRef(null);

  const handleEditorSave = ({ html, json }) => {
    onSave({
      name,
      subject,
      html_content: html,
      editor_json: JSON.stringify(json),
      active: template?.active ?? true,
    });
  };

  // Step 1: nombre + asunto
  if (step === 'meta') {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
          <Card className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">{isNew ? 'Nuevo Template' : 'Editar Template'}</h3>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
            </div>

            <div>
              <Label className="text-xs font-semibold">Nombre (identificador único)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isNew}
                className={`mt-1 ${!isNew ? 'bg-muted' : ''}`}
                placeholder="ej: promo_verano"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">
                Asunto — usa <code className="bg-muted px-1 rounded text-[10px]">{'{{variables}}'}</code>
              </Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
                placeholder="Hola {{name}}, tenemos noticias 🚀"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700">
                En el siguiente paso podrás diseñar el cuerpo del email con el editor visual drag & drop.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => setStep('editor')} disabled={!name || !subject}>
                Abrir editor visual →
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  const handleHeaderSave = () => {
    editorRef.current?.save();
  };

  // Step 2: editor full-screen
  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-5 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => setStep('meta')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Volver
        </button>
        <div className="h-4 w-px bg-border" />
          <span className="font-semibold text-sm truncate">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleHeaderSave}>
            Guardar template
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <GrapesEditor
          ref={editorRef}
          initialHtml={template?.html_content}
          initialJson={template?.editor_json}
          onSave={handleEditorSave}
        />
      </div>
    </div>
  );
}
