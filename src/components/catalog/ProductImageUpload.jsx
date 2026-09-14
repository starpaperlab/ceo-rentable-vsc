import React, { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE = 5 * 1024 * 1024

function safeSegment(value = 'user') {
  return `${value || 'user'}`.replace(/[^a-zA-Z0-9@._-]/g, '_')
}

function extensionFor(file) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export default function ProductImageUpload({ value, onChange, ownerRef, readOnly = false }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || readOnly) return

    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error('Usa una imagen JPG, PNG o WebP.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('La imagen no puede pesar más de 5 MB.')
      return
    }

    setUploading(true)
    try {
      const path = `product-images/${safeSegment(ownerRef)}/${Date.now()}-${crypto.randomUUID()}.${extensionFor(file)}`
      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('uploads').getPublicUrl(path)
      if (!data?.publicUrl) throw new Error('No se pudo obtener la imagen cargada.')

      onChange(data.publicUrl)
      toast.success('Imagen cargada')
    } catch (error) {
      toast.error(error?.message || 'No se pudo subir la imagen.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Imagen del producto</Label>
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-3 sm:flex-row sm:items-center">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-background shadow-sm">
          {value ? (
            <img src={value} alt="Vista previa del producto" className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImagePlus className="h-8 w-8" />
              <span className="text-[11px]">Sin imagen</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Sube una foto clara de tu producto</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Recomendado: 1200 × 1200 px · JPG, PNG o WebP · máximo 5 MB.
          </p>
          {!readOnly ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {uploading ? 'Subiendo…' : value ? 'Cambiar imagen' : 'Subir imagen'}
              </Button>
              {value ? (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange('')} disabled={uploading}>
                  <Trash2 className="mr-2 h-4 w-4" />Eliminar
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={readOnly || uploading} />
    </div>
  )
}
