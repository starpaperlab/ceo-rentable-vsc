import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export default function ClientForm({ client, onSubmit, onCancel, isLoading }) {
  const [form, setForm] = useState({
    name: client?.name || '',
    email: client?.email || '',
    phone: client?.phone || '',
    total_billed: Number(client?.total_billed || 0),
    status: client?.status || 'new',
    notes: client?.notes || '',
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{client ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCancel}><X className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input value={form.name} onChange={e => update('name', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={form.email} onChange={e => update('email', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Teléfono</Label>
            <Input value={form.phone} onChange={e => update('phone', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Total Facturado</Label>
            <Input type="number" value={form.total_billed || ''} onChange={e => update('total_billed', parseFloat(e.target.value) || 0)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={form.status || 'new'} onValueChange={v => update('status', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Nuevo</SelectItem>
                <SelectItem value="recurring">Recurrente</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Notas</Label>
          <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} className="mt-1" rows={2} />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button className="bg-primary text-primary-foreground" onClick={() => onSubmit(form)} disabled={!form.name || isLoading}>
            {client ? 'Actualizar' : 'Crear'} Cliente
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
