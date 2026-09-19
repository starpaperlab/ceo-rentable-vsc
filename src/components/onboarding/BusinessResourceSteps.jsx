import React,{useMemo,useState}from'react';
import{Check,ChevronDown,Edit3,Loader2,Plus,Trash2,X}from'lucide-react';
import{supabase}from'@/lib/supabase';
import{Button}from'@/components/ui/button';
import{Input}from'@/components/ui/input';

const INPUT='h-11 rounded-xl bg-background';
const FREQUENCIES=[['monthly','Mensual'],['weekly','Semanal'],['quarterly','Trimestral'],['semiannual','Semestral'],['annual','Anual'],['one_time','Pago único']];
const SUBSCRIPTION_FREQUENCIES=FREQUENCIES.filter(([id])=>['monthly','quarterly','semiannual','annual'].includes(id));
const EXPENSE_CATEGORIES=[['operacion','Operación'],['software','Software y herramientas'],['administracion','Administración'],['marketing','Marketing'],['equipos','Equipos'],['otro','Otro']];
const UNITS=['unidad','hoja','paquete','caja','libra','kilogramo','gramo','litro','mililitro','metro','pie','yarda','docena','otro'];

function money(value){const n=Number(value||0);return new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',maximumFractionDigits:2}).format(Number.isFinite(n)?n:0)}
function Select({value,onChange,children,disabled=false}){return <div className="relative"><select value={value} onChange={onChange} disabled={disabled} className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm text-foreground disabled:opacity-60">{children}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/></div>}
function Field({label,children,hint}){return <label className="space-y-1.5 text-sm font-semibold text-foreground"><span>{label}</span>{children}{hint&&<span className="block text-xs font-normal text-muted-foreground">{hint}</span>}</label>}

function ResourceShell({title,subtitle,suggestions,onSuggestion,onAdd,children,empty=false}){
 return <div className="space-y-5">
  <div><h2 className="text-2xl font-bold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{subtitle}</p></div>
  {suggestions?.length>0&&<div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sugerencias para tu negocio</p><div className="flex flex-wrap gap-2">{suggestions.map(item=><button key={item} type="button" onClick={()=>onSuggestion(item)} className="rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground transition hover:border-primary hover:text-primary">+ {item}</button>)}</div></div>}
  <Button type="button" variant="outline" onClick={onAdd}><Plus className="mr-2 h-4 w-4"/>Agregar otro</Button>
  {children}
  {empty&&<p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Todavía no has agregado ninguno.</p>}
 </div>
}

function RowActions({onEdit,onDelete,disabled}){return <div className="flex shrink-0 gap-1"><button type="button" onClick={onEdit} disabled={disabled} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Editar"><Edit3 className="h-4 w-4"/></button><button type="button" onClick={onDelete} disabled={disabled} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" aria-label="Eliminar"><Trash2 className="h-4 w-4"/></button></div>}

function FormCard({title,onCancel,onSave,saving,children}){
 return <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
  <div className="mb-4 flex items-center justify-between gap-3"><p className="font-semibold">{title}</p><button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-background"><X className="h-4 w-4"/></button></div>
  <div className="space-y-4">{children}</div>
  <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button><Button type="button" onClick={onSave} disabled={saving}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Check className="mr-2 h-4 w-4"/>}Guardar</Button></div>
 </div>
}

export function ExpenseStep({suggestions=[],rows,setRows,workspaceId,user,onError}){
 const blank={name:'',category:'operacion',amount:'',frequency:'monthly',usage_scope:'business',is_subscription:false};
 const[form,setForm]=useState(null);const[saving,setSaving]=useState(false);
 const frequencies=form?.is_subscription?SUBSCRIPTION_FREQUENCIES:FREQUENCIES;
 const open=(name='')=>setForm({...blank,name});
 const edit=row=>setForm({...blank,...row,amount:row.amount??''});
 const save=async()=>{if(!form?.name?.trim()){onError?.('Escribe el nombre del gasto.');return}if(form.amount===''||Number(form.amount)<0){onError?.('Indica un monto aproximado válido.');return}setSaving(true);onError?.('');
  try{const payload={workspace_id:workspaceId,user_id:user.id,created_by:(user.email||'').toLowerCase(),name:form.name.trim(),category:form.category,amount:Number(form.amount),frequency:form.frequency,usage_scope:form.usage_scope,is_subscription:Boolean(form.is_subscription),source:form.source||'onboarding'};
   const q=form.id?supabase.from('business_expenses').update(payload).eq('id',form.id).eq('workspace_id',workspaceId):supabase.from('business_expenses').insert(payload);
   const{data,error}=await q.select('*').single();if(error)throw error;
   setRows(list=>form.id?list.map(x=>x.id===data.id?data:x):[...list,data]);setForm(null);
  }catch(e){onError?.(e?.message||'No pudimos guardar el gasto.')}finally{setSaving(false)}};
 const remove=async row=>{const{error}=await supabase.from('business_expenses').delete().eq('id',row.id).eq('workspace_id',workspaceId);if(error){onError?.(error.message);return}setRows(list=>list.filter(x=>x.id!==row.id))};
 return <ResourceShell title="Gastos y suscripciones" subtitle="Registra lo que pagas; CEO Rentable hará los prorrateos después. Marca lo compartido con tu hogar para no cargarle el 100% al negocio." suggestions={suggestions} onSuggestion={open} onAdd={()=>open()} empty={!rows.length&&!form}>
  {form&&<FormCard title={form.id?'Editar gasto':'Nuevo gasto'} onCancel={()=>setForm(null)} onSave={save} saving={saving}>
   <div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre"><Input className={INPUT} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ej. Electricidad"/></Field><Field label="Monto aproximado"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">RD$</span><Input className={`${INPUT} pl-12`} type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))}/></div></Field></div>
   <div className="grid gap-4 sm:grid-cols-2"><Field label="Categoría"><Select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}>{EXPENSE_CATEGORIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</Select></Field><Field label="Frecuencia"><Select value={form.frequency} onChange={e=>setForm(p=>({...p,frequency:e.target.value}))}>{frequencies.map(([id,label])=><option key={id} value={id}>{label}</option>)}</Select></Field></div>
   <Field label="Uso"><Select value={form.usage_scope} onChange={e=>setForm(p=>({...p,usage_scope:e.target.value}))}><option value="business">100% negocio</option><option value="shared">Compartido hogar / negocio</option><option value="personal">Personal / no incluir</option></Select></Field>
   <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.is_subscription} onChange={e=>setForm(p=>({...p,is_subscription:e.target.checked,frequency:e.target.checked&&!['monthly','quarterly','semiannual','annual'].includes(p.frequency)?'monthly':p.frequency,category:e.target.checked&&p.category==='operacion'?'software':p.category}))}/><span><strong>Es una suscripción o software recurrente</strong><span className="mt-0.5 block text-xs text-muted-foreground">Ej. Canva, ChatGPT, Adobe, hosting o CRM.</span></span></label>
  </FormCard>}
  <div className="space-y-2">{rows.map(row=><div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{row.name}</p>{row.is_subscription&&<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Suscripción</span>}</div><p className="text-xs text-muted-foreground">{money(row.amount)} · {FREQUENCIES.find(f=>f[0]===row.frequency)?.[1]||row.frequency} · {row.usage_scope==='shared'?'Compartido':row.usage_scope==='personal'?'No incluir':'Negocio'}</p></div><RowActions onEdit={()=>edit(row)} onDelete={()=>remove(row)} disabled={saving}/></div>)}</div>
 </ResourceShell>
}

export function MaterialStep({title='Materiales e insumos',subtitle,suggestions=[],rows,setRows,workspaceId,user,onError}){
 const blank={name:'',purchase_price:'',purchase_quantity:'',unit:'unidad',custom_unit:''};const[form,setForm]=useState(null);const[saving,setSaving]=useState(false);
 const open=(name='')=>setForm({...blank,name});const edit=row=>setForm({...blank,...row,purchase_price:row.purchase_price??'',purchase_quantity:row.purchase_quantity??''});
 const unitLabel=useMemo(()=>form?.unit==='otro'?(form?.custom_unit||'personalizada'):form?.unit,[form?.unit,form?.custom_unit]);
 const save=async()=>{if(!form?.name?.trim())return onError?.('Escribe el nombre del material.');if(Number(form.purchase_price)<0||form.purchase_price==='')return onError?.('Indica cuánto pagaste.');if(Number(form.purchase_quantity)<=0||form.purchase_quantity==='')return onError?.('Indica cuánta cantidad compraste.');if(form.unit==='otro'&&!form.custom_unit?.trim())return onError?.('Escribe la unidad personalizada.');setSaving(true);onError?.('');
  try{const payload={workspace_id:workspaceId,user_id:user.id,created_by:(user.email||'').toLowerCase(),name:form.name.trim(),purchase_price:Number(form.purchase_price),purchase_quantity:Number(form.purchase_quantity),unit:form.unit,custom_unit:form.unit==='otro'?form.custom_unit.trim():null,source:form.source||'onboarding'};const q=form.id?supabase.from('business_materials').update(payload).eq('id',form.id).eq('workspace_id',workspaceId):supabase.from('business_materials').insert(payload);const{data,error}=await q.select('*').single();if(error)throw error;setRows(list=>form.id?list.map(x=>x.id===data.id?data:x):[...list,data]);setForm(null)}catch(e){onError?.(e?.message||'No pudimos guardar el material.')}finally{setSaving(false)}};
 const remove=async row=>{const{error}=await supabase.from('business_materials').delete().eq('id',row.id).eq('workspace_id',workspaceId);if(error)return onError?.(error.message);setRows(list=>list.filter(x=>x.id!==row.id))};
 return <ResourceShell title={title} subtitle={subtitle} suggestions={suggestions} onSuggestion={open} onAdd={()=>open()} empty={!rows.length&&!form}>
  {form&&<FormCard title={form.id?'Editar material':'Nuevo material'} onCancel={()=>setForm(null)} onSave={save} saving={saving}>
   <Field label="Material o insumo"><Input className={INPUT} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ej. Papel bond"/></Field>
   <div className="grid gap-4 sm:grid-cols-2"><Field label="¿Cuánto pagaste?"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">RD$</span><Input className={`${INPUT} pl-12`} type="number" min="0" step="0.01" value={form.purchase_price} onChange={e=>setForm(p=>({...p,purchase_price:e.target.value}))}/></div></Field><Field label="¿Cuánta cantidad compraste?"><Input className={INPUT} type="number" min="0.0001" step="0.0001" value={form.purchase_quantity} onChange={e=>setForm(p=>({...p,purchase_quantity:e.target.value}))}/></Field></div>
   <Field label="Unidad"><Select value={form.unit} onChange={e=>setForm(p=>({...p,unit:e.target.value}))}>{UNITS.map(x=><option key={x} value={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</Select></Field>
   {form.unit==='otro'&&<Field label="Unidad personalizada"><Input className={INPUT} value={form.custom_unit||''} onChange={e=>setForm(p=>({...p,custom_unit:e.target.value}))} placeholder="Ej. rollo, botella, plancha"/></Field>}
   {form.purchase_price!==''&&form.purchase_quantity!==''&&Number(form.purchase_quantity)>0&&<div className="rounded-xl border border-primary/20 bg-background p-3 text-sm"><p className="text-muted-foreground">CEO Rentable guardará la compra como <strong>{money(form.purchase_price)}</strong> por <strong>{form.purchase_quantity} {unitLabel}</strong>.</p><p className="mt-1 text-xs text-muted-foreground">El costo unitario automático se activará en el Bloque B.</p></div>}
  </FormCard>}
  <div className="space-y-2">{rows.map(row=><div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"><div className="min-w-0"><p className="truncate font-semibold">{row.name}</p><p className="text-xs text-muted-foreground">{money(row.purchase_price)} · {row.purchase_quantity} {row.unit==='otro'?(row.custom_unit||'unidad'):row.unit}</p></div><RowActions onEdit={()=>edit(row)} onDelete={()=>remove(row)} disabled={saving}/></div>)}</div>
 </ResourceShell>
}

export function EquipmentStep({suggestions=[],rows,setRows,workspaceId,user,onError}){
 const blank={name:'',estimated_price:'',purchased_on:'',usage_scope:'business',usage_intensity:'regular'};const[form,setForm]=useState(null);const[saving,setSaving]=useState(false);
 const open=(name='')=>setForm({...blank,name});const edit=row=>setForm({...blank,...row,estimated_price:row.estimated_price??'',purchased_on:row.purchased_on||''});
 const save=async()=>{if(!form?.name?.trim())return onError?.('Escribe el nombre del equipo.');if(form.estimated_price===''||Number(form.estimated_price)<0)return onError?.('Indica un precio aproximado válido.');setSaving(true);onError?.('');
  try{const payload={workspace_id:workspaceId,user_id:user.id,created_by:(user.email||'').toLowerCase(),name:form.name.trim(),estimated_price:Number(form.estimated_price),purchased_on:form.purchased_on||null,usage_scope:form.usage_scope,usage_intensity:form.usage_intensity,source:form.source||'onboarding'};const q=form.id?supabase.from('business_equipment').update(payload).eq('id',form.id).eq('workspace_id',workspaceId):supabase.from('business_equipment').insert(payload);const{data,error}=await q.select('*').single();if(error)throw error;setRows(list=>form.id?list.map(x=>x.id===data.id?data:x):[...list,data]);setForm(null)}catch(e){onError?.(e?.message||'No pudimos guardar el equipo.')}finally{setSaving(false)}};
 const remove=async row=>{const{error}=await supabase.from('business_equipment').delete().eq('id',row.id).eq('workspace_id',workspaceId);if(error)return onError?.(error.message);setRows(list=>list.filter(x=>x.id!==row.id))};
 return <ResourceShell title="Equipos y herramientas" subtitle="No te pediremos depreciación ni vida útil. Solo el dato que conoces hoy; CEO Rentable hará la distribución después." suggestions={suggestions} onSuggestion={open} onAdd={()=>open()} empty={!rows.length&&!form}>
  {form&&<FormCard title={form.id?'Editar equipo':'Nuevo equipo'} onCancel={()=>setForm(null)} onSave={save} saving={saving}>
   <div className="grid gap-4 sm:grid-cols-2"><Field label="Equipo o herramienta"><Input className={INPUT} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ej. Impresora"/></Field><Field label="Precio aproximado"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">RD$</span><Input className={`${INPUT} pl-12`} type="number" min="0" step="0.01" value={form.estimated_price} onChange={e=>setForm(p=>({...p,estimated_price:e.target.value}))}/></div></Field></div>
   <Field label="Fecha aproximada de compra" hint="Opcional. Si no la recuerdas, déjala vacía."><Input className={INPUT} type="date" value={form.purchased_on||''} onChange={e=>setForm(p=>({...p,purchased_on:e.target.value}))}/></Field>
   <div className="grid gap-4 sm:grid-cols-2"><Field label="Uso"><Select value={form.usage_scope} onChange={e=>setForm(p=>({...p,usage_scope:e.target.value}))}><option value="business">Exclusivo del negocio</option><option value="shared">Compartido</option></Select></Field><Field label="Frecuencia de uso"><Select value={form.usage_intensity} onChange={e=>setForm(p=>({...p,usage_intensity:e.target.value}))}><option value="low">Poco</option><option value="regular">Regular</option><option value="high">Mucho</option></Select></Field></div>
  </FormCard>}
  <div className="space-y-2">{rows.map(row=><div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"><div className="min-w-0"><p className="truncate font-semibold">{row.name}</p><p className="text-xs text-muted-foreground">{money(row.estimated_price)} · {row.usage_scope==='shared'?'Compartido':'Negocio'} · uso {row.usage_intensity==='high'?'alto':row.usage_intensity==='low'?'bajo':'regular'}</p></div><RowActions onEdit={()=>edit(row)} onDelete={()=>remove(row)} disabled={saving}/></div>)}</div>
 </ResourceShell>
}
