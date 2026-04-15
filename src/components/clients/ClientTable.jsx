import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Users, Star } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';

const statusLabels = { new: 'Nuevo', recurring: 'Recurrente', vip: 'VIP' };
const statusColors = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  recurring: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  vip: 'bg-primary/10 text-primary',
};

export default function ClientTable({ clients, onEdit, onDelete }) {
  const { formatMoney } = useCurrency();

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Cliente</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Facturación</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Ranking</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No hay clientes aún</p>
                </TableCell>
              </TableRow>
            ) : (
              clients.map(c => (
                <TableRow key={c.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                        {c.name?.[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.email || '-'}</TableCell>
                  <TableCell className="font-semibold">{formatMoney(c.total_billed || 0)}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[c.status || 'new']}>{statusLabels[c.status || 'new']}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      {[1, 2, 3].map(i => (
                        <Star key={i} className={`h-3.5 w-3.5 ${i <= (c.ranking || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}`} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(c.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}