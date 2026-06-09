import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function formatSavedAt(value) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function DraftRecoveryDialog({
  open,
  title = 'Encontramos cambios sin guardar',
  description = 'Encontramos un borrador local más reciente que la versión guardada. ¿Quieres recuperarlo?',
  savedAt,
  onRecover,
  onDiscard,
}) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {savedAt && (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Último borrador local: <span className="font-medium text-foreground">{formatSavedAt(savedAt)}</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={onDiscard}>
            Descartar
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={onRecover}>
            Recuperar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
