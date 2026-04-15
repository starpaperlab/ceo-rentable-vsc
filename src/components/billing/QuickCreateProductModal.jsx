import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership';

export default function QuickCreateProductModal({ initialName = '', onCreated, onClose }) {
  const queryClient = useQueryClient();
  const { user, userProfile, isAdmin } = useAuth();
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [loading, setLoading] = useState(false);
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;

  const handleSave = async () => {
    if (!name.trim()) { toast.error('El nombre es requerido'); return; }
    if (!user && !ownerEmail) { toast.error('Usuario no autenticado'); return; }
    
    setLoading(true);

    try {
      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de crear producto:', profileError?.message || profileError);
        }
      }

      const initialPayload = {
        user_id: ownerId,
        created_by: ownerEmail || null,
        name: name.trim(),
        sale_price: parseFloat(price) || 0,
        current_stock: parseFloat(stock) || 0,
        product_type: 'fisico',
        status: 'active',
      };

      const insertProduct = async (payload) => {
        const { data, error } = await supabase
          .from('products')
          .insert(payload)
          .select()
          .single();
        if (!error) return data;

        if (isMissingColumnError(error, 'products.user_id') || isMissingColumnError(error, 'user_id')) {
          const next = { ...payload };
          delete next.user_id;
          return insertProduct(next);
        }
        if (isMissingColumnError(error, 'products.created_by') || isMissingColumnError(error, 'created_by')) {
          const next = { ...payload };
          delete next.created_by;
          return insertProduct(next);
        }
        if (isMissingColumnError(error, 'products.current_stock') || isMissingColumnError(error, 'current_stock')) {
          const next = { ...payload };
          delete next.current_stock;
          return insertProduct(next);
        }
        if (isMissingColumnError(error, 'products.product_type') || isMissingColumnError(error, 'product_type')) {
          const next = { ...payload };
          delete next.product_type;
          return insertProduct(next);
        }
        if (hasOwnerConstraintIssue(error, 'products')) {
          const next = { ...payload };
          delete next.user_id;
          return insertProduct(next);
        }
        throw error;
      };

      const productData = await insertProduct(initialPayload);

      toast.success(`Producto "${name}" creado`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      onCreated({
        id: productData.id,
        product_name: name.trim(),
        sale_price: parseFloat(price) || 0,
        current_stock: parseFloat(stock) || 0,
        product_type: productData.product_type || 'fisico',
        descripcion: productData.descripcion || null,
      });
    } catch (error) {
      toast.error('Error: ' + (error.message || 'No se pudo crear el producto'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">Nuevo Producto</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre del producto *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="Ej: Servicio de diseño" />
          </div>
          <div>
            <Label className="text-xs">Precio de venta</Label>
            <Input type="number" value={price} onChange={e => setPrice(e.target.value)} className="mt-1" placeholder="0.00" min="0" />
          </div>
          <div>
            <Label className="text-xs">Stock inicial</Label>
            <Input type="number" value={stock} onChange={e => setStock(e.target.value)} className="mt-1" placeholder="0" min="0" />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-primary" onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Guardando...' : 'Crear y seleccionar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
