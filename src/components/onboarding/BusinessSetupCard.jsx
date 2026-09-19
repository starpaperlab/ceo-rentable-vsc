import React,{useEffect,useState}from'react';
import{ArrowRight,CheckCircle2,Loader2}from'lucide-react';
import{useNavigate}from'react-router-dom';
import{supabase}from'@/lib/supabase';
import{Button}from'@/components/ui/button';
import{Card}from'@/components/ui/card';
import{setupCompletion}from'@/config/industryTemplates';

const SECTIONS=[
  ['Perfil','Datos generales y fiscales','/AppSettings'],
  ['Tipo de negocio','Qué vendes e industria','/Onboarding?edit=1&step=0'],
  ['Capacidad','Días, horas y volumen mensual','/Onboarding?edit=1&step=3'],
  ['Gastos','Operación y gastos compartidos','/Onboarding?edit=1&step=5'],
  ['Suscripciones','Software y pagos recurrentes','/Onboarding?edit=1&step=6'],
  ['Materiales','Compras, cantidades y unidades','/Onboarding?edit=1&step=7'],
  ['Equipos','Herramientas y nivel de uso','/Onboarding?edit=1&step=8'],
  ['Meta de ingresos','Lo que quieres ganar personalmente','/Onboarding?edit=1&step=4'],
];

export default function BusinessSetupCard({workspaceId,canManage=true}){
 const navigate=useNavigate();const[loading,setLoading]=useState(true);const[config,setConfig]=useState(null);const[counts,setCounts]=useState({expenses:0,materials:0,equipment:0});
 useEffect(()=>{if(!workspaceId){setLoading(false);setConfig(null);return}let cancelled=false;(async()=>{setLoading(true);try{
  const[cfg,exp,mat,eq]=await Promise.all([
   supabase.from('business_config').select('*').eq('workspace_id',workspaceId).maybeSingle(),
   supabase.from('business_expenses').select('id',{count:'exact',head:true}).eq('workspace_id',workspaceId),
   supabase.from('business_materials').select('id',{count:'exact',head:true}).eq('workspace_id',workspaceId),
   supabase.from('business_equipment').select('id',{count:'exact',head:true}).eq('workspace_id',workspaceId),
  ]);
  if(cfg.error)throw cfg.error;if(exp.error)throw exp.error;if(mat.error)throw mat.error;if(eq.error)throw eq.error;
  if(cancelled)return;setConfig(cfg.data);setCounts({expenses:exp.count||0,materials:mat.count||0,equipment:eq.count||0});
 }catch(e){console.error('No se pudo cargar la configuración del negocio:',e);if(!cancelled)setConfig(null)}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[workspaceId]);
 const completion=setupCompletion(config||{},counts);
 return <Card className="p-5">
  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary"/><p className="font-semibold">Configuración del negocio</p></div><p className="mt-1 text-xs text-muted-foreground">Todo lo que CEO Rentable conoce de este negocio queda editable aquí.</p></div>
   {loading?<Loader2 className="h-5 w-5 animate-spin text-primary"/>:<div className="min-w-[82px] rounded-xl bg-primary/10 px-3 py-2 text-center"><p className="text-lg font-black text-primary">{completion}%</p><p className="text-[10px] text-muted-foreground">completa</p></div>}
  </div>
  <div className="grid gap-2 sm:grid-cols-2">
   {SECTIONS.map(([label,description,path])=><button key={label} type="button" disabled={!canManage} onClick={()=>canManage&&navigate(path)} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"><div><p className="text-sm font-semibold">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground"/></button>)}
  </div>
  {canManage&&<Button type="button" variant="outline" className="mt-4 w-full sm:w-auto" onClick={()=>navigate('/Onboarding?edit=1&step=0')}>Revisar configuración completa<ArrowRight className="ml-2 h-4 w-4"/></Button>}
 </Card>;
}
