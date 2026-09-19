import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  BUSINESS_MODELS,
  WORKPLACE_OPTIONS,
  industryOptionsFor,
  mergedIndustryTemplate,
  setupCompletion,
} from '@/config/industryTemplates';
import { ExpenseStep, MaterialStep, EquipmentStep } from '@/components/onboarding/BusinessResourceSteps';

const STEPS = ['Tu negocio','Industria','Lugar','Capacidad','Meta','Gastos','Materiales','Equipos','Resumen'];
const FREQUENCIES = [
  ['monthly','Mensual'],['weekly','Semanal'],['quarterly','Trimestral'],
  ['semiannual','Semestral'],['annual','Anual'],['one_time','Pago único'],
];
const UNITS = ['unidad','hoja','paquete','caja','libra','kilogramo','gramo','litro','mililitro','metro','pie','yarda','docena','otro'];
const EXPENSE_CATEGORIES = [
  ['operacion','Operación'],['software','Software y herramientas'],['administracion','Administración'],
  ['marketing','Marketing'],['equipos','Equipos'],['otro','Otro'],
];

const emptyConfig = {
  business_name: '', currency: 'DOP', business_model: null, industry_codes: [], custom_industry: '',
  workplace_modes: [], custom_workplace: '', work_days_per_week: '', work_hours_per_day: '',
  monthly_capacity: '', monthly_capacity_unknown: false, personal_income_goal: '',
  onboarding_status: 'not_started', onboarding_step: 0, onboarding_answers: {},
};

const cardBase = 'rounded-2xl border p-4 text-left transition';
const inputClass = 'h-11 rounded-xl bg-background';

function money(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',maximumFractionDigits:0}).format(Number.isFinite(n)?n:0);
}

function ToggleCard({ selected, title, subtitle, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`${cardBase} ${selected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
          {selected && <Check className="h-3.5 w-3.5" />}
        </div>
        <div><p className="font-semibold text-foreground">{title}</p>{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div>
      </div>
    </button>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refreshUserProfile } = useAuth();
  const { activeWorkspace, activeWorkspaceId, isLoadingWorkspace } = useWorkspace();
  const [step,setStep] = useState(0);
  const [config,setConfig] = useState(emptyConfig);
  const [configId,setConfigId] = useState(null);
  const [expenses,setExpenses] = useState([]);
  const [materials,setMaterials] = useState([]);
  const [equipment,setEquipment] = useState([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const hydrated = useRef(false);

  const template = useMemo(()=>mergedIndustryTemplate(config.industry_codes || []),[config.industry_codes]);
  const completion = useMemo(()=>setupCompletion(config,{expenses:expenses.length,materials:materials.length,equipment:equipment.length}),[config,expenses.length,materials.length,equipment.length]);
  const productBusiness = config.business_model === 'products' || config.business_model === 'both';

  useEffect(()=>{
    if (isLoadingWorkspace || !user?.id || !activeWorkspaceId) return;
    let cancelled=false;
    (async()=>{
      setLoading(true); setError('');
      try {
        const [{data:cfg,error:cfgError},{data:exp,error:expError},{data:mat,error:matError},{data:eq,error:eqError}] = await Promise.all([
          supabase.from('business_config').select('*').eq('workspace_id',activeWorkspaceId).maybeSingle(),
          supabase.from('business_expenses').select('*').eq('workspace_id',activeWorkspaceId).order('created_at'),
          supabase.from('business_materials').select('*').eq('workspace_id',activeWorkspaceId).order('created_at'),
          supabase.from('business_equipment').select('*').eq('workspace_id',activeWorkspaceId).order('created_at'),
        ]);
        if (cfgError) throw cfgError; if (expError) throw expError; if (matError) throw matError; if (eqError) throw eqError;
        let next=cfg;
        if (!next) {
          const payload={user_id:user.id,created_by:(user.email||'').toLowerCase(),workspace_id:activeWorkspaceId,business_name:activeWorkspace?.name||'Mi negocio',currency:activeWorkspace?.currency_code||'DOP',timezone:activeWorkspace?.timezone||'America/Santo_Domingo',onboarding_status:'in_progress',onboarding_step:0};
          const created=await supabase.from('business_config').insert(payload).select('*').single();
          if (created.error) throw created.error;
          next=created.data;
        }
        if(cancelled)return;
        setConfigId(next.id);
        setConfig({...emptyConfig,...next,industry_codes:next.industry_codes||[],workplace_modes:next.workplace_modes||[]});
        setStep(Math.min(Number(next.onboarding_step||0),STEPS.length-1));
        setExpenses(exp||[]); setMaterials(mat||[]); setEquipment(eq||[]);
        hydrated.current=true;
      } catch(e){ console.error(e); if(!cancelled)setError(e?.message||'No pudimos cargar la configuración.'); }
      finally{if(!cancelled)setLoading(false);}
    })();
    return()=>{cancelled=true;};
  },[activeWorkspaceId,activeWorkspace?.name,activeWorkspace?.currency_code,activeWorkspace?.timezone,isLoadingWorkspace,user?.id,user?.email]);

  useEffect(()=>{
    if(!hydrated.current || !configId || !activeWorkspaceId)return;
    const timer=setTimeout(async()=>{
      const payload={
        business_name: config.business_name || activeWorkspace?.name || 'Mi negocio',
        currency: config.currency || activeWorkspace?.currency_code || 'DOP',
        business_model: config.business_model || null,
        industry_codes: config.industry_codes || [],
        custom_industry: config.custom_industry || null,
        workplace_modes: config.workplace_modes || [],
        custom_workplace: config.custom_workplace || null,
        work_days_per_week: config.work_days_per_week === '' ? null : Number(config.work_days_per_week),
        work_hours_per_day: config.work_hours_per_day === '' ? null : Number(config.work_hours_per_day),
        monthly_capacity: config.monthly_capacity === '' ? null : Number(config.monthly_capacity),
        monthly_capacity_unknown: Boolean(config.monthly_capacity_unknown),
        personal_income_goal: config.personal_income_goal === '' ? null : Number(config.personal_income_goal),
        onboarding_status: config.onboarding_status === 'completed' ? 'completed' : 'in_progress',
        onboarding_step: step,
        onboarding_answers: {...(config.onboarding_answers||{}),setup_completion_pct:completion},
        updated_at:new Date().toISOString(),
      };
      const {error:saveError}=await supabase.from('business_config').update(payload).eq('id',configId).eq('workspace_id',activeWorkspaceId);
      if(saveError){console.error(saveError);setError('No pudimos guardar automáticamente este cambio.');}
    },550);
    return()=>clearTimeout(timer);
  },[config,configId,activeWorkspaceId,activeWorkspace?.name,activeWorkspace?.currency_code,step,completion]);

  const toggleIndustry=(code)=>{
    if(config.business_model==='both'){
      setConfig(p=>({...p,industry_codes:p.industry_codes.includes(code)?p.industry_codes.filter(x=>x!==code):[...p.industry_codes.filter(x=>x!=='other'),code]}));
    } else {
      setConfig(p=>({...p,industry_codes:[code]}));
    }
  };

  const canContinue=()=>{
    if(step===0)return Boolean(config.business_model);
    if(step===1)return config.industry_codes.length>0 && (!config.industry_codes.includes('other') || config.custom_industry.trim());
    if(step===2)return config.workplace_modes.length>0 && (!config.workplace_modes.includes('other') || config.custom_workplace.trim());
    if(step===3)return config.work_days_per_week!=='' && config.work_hours_per_day!=='' && (config.monthly_capacity_unknown || config.monthly_capacity!=='');
    if(step===4)return config.personal_income_goal!=='';
    return true;
  };

  const goNext=()=>{if(!canContinue()){setError('Completa la información principal de este paso.');return;}setError('');setStep(s=>Math.min(s+1,STEPS.length-1));};
  const goBack=()=>{setError('');setStep(s=>Math.max(0,s-1));};

  const addExpense=async(preset='')=>{
    if(!preset) preset=window.prompt('Nombre del gasto')||'';
    if(!preset.trim())return;
    const amount=Number(window.prompt('Monto aproximado en RD$','0')||0);
    const payload={workspace_id:activeWorkspaceId,user_id:user.id,created_by:(user.email||'').toLowerCase(),name:preset.trim(),amount:Number.isFinite(amount)?amount:0,category:'operacion',frequency:'monthly',usage_scope:'business',is_subscription:false,source:'onboarding'};
    const {data,error:e}=await supabase.from('business_expenses').insert(payload).select('*').single();
    if(e){setError(e.message);return;} setExpenses(x=>[...x,data]);
  };
  const addMaterial=async(preset='')=>{
    if(!preset) preset=window.prompt('Nombre del material o insumo')||'';
    if(!preset.trim())return;
    const purchasePrice=Number(window.prompt('¿Cuánto pagaste? RD$','0')||0);
    const quantity=Number(window.prompt('¿Cuántas unidades trae o compraste?','1')||1);
    const payload={workspace_id:activeWorkspaceId,user_id:user.id,created_by:(user.email||'').toLowerCase(),name:preset.trim(),purchase_price:Math.max(0,purchasePrice||0),purchase_quantity:Math.max(0.0001,quantity||1),unit:'unidad',source:'onboarding'};
    const {data,error:e}=await supabase.from('business_materials').insert(payload).select('*').single();
    if(e){setError(e.message);return;} setMaterials(x=>[...x,data]);
  };
  const addEquipment=async(preset='')=>{
    if(!preset) preset=window.prompt('Nombre del equipo o herramienta')||'';
    if(!preset.trim())return;
    const price=Number(window.prompt('Precio aproximado en RD$','0')||0);
    const payload={workspace_id:activeWorkspaceId,user_id:user.id,created_by:(user.email||'').toLowerCase(),name:preset.trim(),estimated_price:Math.max(0,price||0),usage_scope:'business',usage_intensity:'regular',source:'onboarding'};
    const {data,error:e}=await supabase.from('business_equipment').insert(payload).select('*').single();
    if(e){setError(e.message);return;} setEquipment(x=>[...x,data]);
  };
  const removeRow=async(table,id,setter)=>{
    const {error:e}=await supabase.from(table).delete().eq('id',id).eq('workspace_id',activeWorkspaceId);
    if(e){setError(e.message);return;} setter(rows=>rows.filter(x=>x.id!==id));
  };

  const complete=async()=>{
    setSaving(true);setError('');
    try{
      const now=new Date().toISOString();
      const {error:cfgError}=await supabase.from('business_config').update({onboarding_status:'completed',onboarding_step:STEPS.length-1,onboarding_completed_at:now,onboarding_answers:{...(config.onboarding_answers||{}),setup_completion_pct:completion},updated_at:now}).eq('id',configId).eq('workspace_id',activeWorkspaceId);
      if(cfgError)throw cfgError;
      const {error:userError}=await supabase.from('users').update({onboarding_completed:true,currency:config.currency||'DOP',updated_at:now}).eq('id',user.id);
      if(userError)throw userError;
      await refreshUserProfile();
      navigate('/Dashboard',{replace:true});
    }catch(e){console.error(e);setError(e?.message||'No pudimos completar la configuración.');}
    finally{setSaving(false);}
  };

  if(loading || isLoadingWorkspace){
    return <div className="min-h-[100dvh] bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>;
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><img src="/brand/isotipo.png" alt="CEO Rentable" className="h-10 w-10"/><div><p className="font-bold">CEO Rentable OS™</p><p className="text-xs text-muted-foreground">Tú conoces tu negocio. CEO Rentable hace los cálculos.</p></div></div>
          <div className="text-right"><p className="text-xs text-muted-foreground">Configuración</p><p className="font-bold text-primary">{completion}%</p></div>
        </div>

        <div className="mb-6">
          <div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Paso {step+1} de {STEPS.length}</span><span>{STEPS[step]}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{width:`${((step+1)/STEPS.length)*100}%`}}/></div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          {step===0 && <div className="space-y-5"><div><h1 className="text-2xl font-black sm:text-3xl">¿Qué vende tu negocio?</h1><p className="mt-2 text-sm text-muted-foreground">Esto define las preguntas que verás después.</p></div><div className="grid gap-3 sm:grid-cols-3">{BUSINESS_MODELS.map(x=><ToggleCard key={x.id} selected={config.business_model===x.id} title={x.label} subtitle={x.description} onClick={()=>setConfig(p=>({...p,business_model:x.id,industry_codes:[]}))}/>)}</div></div>}

          {step===1 && <div className="space-y-5"><div><h2 className="text-2xl font-bold">¿Qué tipo de negocio tienes?</h2><p className="mt-2 text-sm text-muted-foreground">Selecciona la opción que más se parezca. Si combinas actividades, puedes marcar varias.</p></div><div className="grid gap-2 sm:grid-cols-2">{industryOptionsFor(config.business_model).map(([id,label])=><ToggleCard key={id} selected={config.industry_codes.includes(id)} title={label} onClick={()=>toggleIndustry(id)}/>)}</div>{config.industry_codes.includes('other')&&<Input className={inputClass} value={config.custom_industry||''} onChange={e=>setConfig(p=>({...p,custom_industry:e.target.value}))} placeholder="Escribe tu tipo de negocio"/>}</div>}

          {step===2 && <div className="space-y-5"><div><h2 className="text-2xl font-bold">¿Desde dónde trabajas principalmente?</h2><p className="mt-2 text-sm text-muted-foreground">Esto nos ayudará luego a separar correctamente los gastos del negocio y del hogar.</p></div><div className="grid gap-2 sm:grid-cols-2">{WORKPLACE_OPTIONS.map(([id,label])=><ToggleCard key={id} selected={config.workplace_modes.includes(id)} title={label} onClick={()=>setConfig(p=>({...p,workplace_modes:id==='combined'?[id]:[id]}))}/>)}</div>{config.workplace_modes.includes('other')&&<Input className={inputClass} value={config.custom_workplace||''} onChange={e=>setConfig(p=>({...p,custom_workplace:e.target.value}))} placeholder="¿Desde dónde trabajas?"/>}</div>}

          {step===3 && <div className="space-y-5"><div><h2 className="text-2xl font-bold">Cuéntanos tu capacidad normal</h2><p className="mt-2 text-sm text-muted-foreground">No buscamos exactitud contable. Una aproximación útil es suficiente.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-semibold">Días por semana<Input className={inputClass} type="number" min="0" max="7" value={config.work_days_per_week??''} onChange={e=>setConfig(p=>({...p,work_days_per_week:e.target.value}))}/></label><label className="space-y-2 text-sm font-semibold">Horas al día<Input className={inputClass} type="number" min="0" max="24" step="0.5" value={config.work_hours_per_day??''} onChange={e=>setConfig(p=>({...p,work_hours_per_day:e.target.value}))}/></label></div><label className="block space-y-2 text-sm font-semibold">{template.capacityLabel}<Input className={inputClass} type="number" min="0" disabled={config.monthly_capacity_unknown} value={config.monthly_capacity??''} onChange={e=>setConfig(p=>({...p,monthly_capacity:e.target.value,monthly_capacity_unknown:false}))}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.monthly_capacity_unknown} onChange={e=>setConfig(p=>({...p,monthly_capacity_unknown:e.target.checked,monthly_capacity:e.target.checked?'':p.monthly_capacity}))}/> No estoy segura</label></div>}

          {step===4 && <div className="space-y-5"><div><h2 className="text-2xl font-bold">¿Cuánto te gustaría ganar personalmente al mes?</h2><p className="mt-2 text-sm text-muted-foreground">Es el dinero que quieres recibir tú. No son las ventas totales del negocio.</p></div><div className="max-w-sm"><label className="text-sm font-semibold">Meta mensual personal</label><div className="relative mt-2"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">RD$</span><Input className={`${inputClass} pl-12`} type="number" min="0" value={config.personal_income_goal??''} onChange={e=>setConfig(p=>({...p,personal_income_goal:e.target.value}))}/></div></div></div>}

          {step===5 && <ExpenseStep suggestions={template.expenses} rows={expenses} setRows={setExpenses} workspaceId={activeWorkspaceId} user={user} onError={setError}/>} 

          {step===6 && <MaterialStep title={productBusiness?'Materiales e insumos':'Materiales (opcional)'} subtitle={productBusiness?'Dinos cuánto pagaste y cuánta cantidad compraste. El costo unitario lo calculará CEO Rentable en el Bloque B.':'Si tu servicio utiliza materiales, puedes registrarlos ahora o completar después.'} suggestions={template.materials} rows={materials} setRows={setMaterials} workspaceId={activeWorkspaceId} user={user} onError={setError}/>} 

          {step===7 && <EquipmentStep suggestions={template.equipment} rows={equipment} setRows={setEquipment} workspaceId={activeWorkspaceId} user={user} onError={setError}/>} 

          {step===8 && <div className="space-y-5"><div className="rounded-2xl bg-primary/10 p-5"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-5 w-5"/></div><h2 className="text-2xl font-bold">Ya conocemos mejor tu negocio.</h2><p className="mt-2 text-sm text-muted-foreground">CEO Rentable utilizará esta información para calcular automáticamente tus costos, gastos indirectos, precio recomendado y rentabilidad en los siguientes motores.</p></div><div className="grid gap-3 sm:grid-cols-2"><Summary label="Qué vendes" value={BUSINESS_MODELS.find(x=>x.id===config.business_model)?.label}/><Summary label="Lugar de trabajo" value={WORKPLACE_OPTIONS.find(x=>config.workplace_modes.includes(x[0]))?.[1]}/><Summary label="Gastos registrados" value={expenses.length}/><Summary label="Materiales principales" value={materials.length}/><Summary label="Equipos" value={equipment.length}/><Summary label="Meta personal" value={money(config.personal_income_goal)}/></div><div className="rounded-2xl border p-4"><div className="flex items-center justify-between"><div><p className="font-semibold">Configuración del negocio</p><p className="text-xs text-muted-foreground">Porcentaje calculado con 10 criterios definidos, no de forma arbitraria.</p></div><span className="text-xl font-black text-primary">{completion}%</span></div></div></div>}

          {error && <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={goBack} disabled={step===0}><ArrowLeft className="mr-2 h-4 w-4"/>Atrás</Button>
            {step<STEPS.length-1 ? <Button onClick={goNext} disabled={!canContinue()}>Continuar<ArrowRight className="ml-2 h-4 w-4"/></Button> : <Button onClick={complete} disabled={saving}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Check className="mr-2 h-4 w-4"/>}Entrar a CEO Rentable</Button>}
          </div>
          {step>=5 && step<8 && <button type="button" onClick={goNext} className="mt-3 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline">Completar después</button>}
        </div>
      </div>
    </div>
  );
}

function CollectionStep({title,subtitle,suggestions,onSuggestion,onAdd,rows,renderRow}){
  return <div className="space-y-5"><div><h2 className="text-2xl font-bold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{subtitle}</p></div>{suggestions?.length>0&&<div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sugerencias para tu negocio</p><div className="flex flex-wrap gap-2">{suggestions.map(item=><button key={item} type="button" onClick={()=>onSuggestion(item)} className="rounded-full border bg-background px-3 py-2 text-sm hover:border-primary hover:text-primary">+ {item}</button>)}</div></div>}<Button type="button" variant="outline" onClick={onAdd}><Plus className="mr-2 h-4 w-4"/>Agregar otro</Button><div className="space-y-2">{rows.map(row=><div key={row.id} className="flex items-center justify-between rounded-xl border bg-background p-3">{renderRow(row)}</div>)}{!rows.length&&<p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Todavía no has agregado ninguno.</p>}</div></div>;
}

function Summary({label,value}){return <div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value||'Pendiente'}</p></div>;}
