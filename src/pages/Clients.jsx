import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/components/shared/CurrencyContext';
import ClientTable from '@/components/clients/ClientTable';
import ClientForm from '@/components/clients/ClientForm';
import Client360Dialog from '@/components/clients/Client360Dialog';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Loader2, Eye } from 'lucide-react';
import PageTour from '@/components/shared/PageTour';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { deleteOwnedRowById, hasOwnerConstraintIssue, isMissingColumnError, updateOwnedRowById } from '@/lib/supabaseOwnership';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const TOUR_STEPS=[{title:'Gestión de Clientes 👥',description:'Tu base de clientes es uno de tus activos más valiosos. Aquí registras cada cliente, cuánto te ha comprado y su categoría.'},{title:'Ticket promedio 💰',description:'El ticket promedio te dice cuánto gasta un cliente en promedio. Entre más alto, mejor. Trabaja para subir este número con upsells.'},{title:'Clientes VIP ⭐',description:'Clasifica tus mejores clientes como VIP. Son los que más ingresos te generan y a quienes debes dar prioridad y atención especial.'}];
function normalizeClientPayload(raw={}){return{name:(raw.name||'').trim(),email:(raw.email||'').trim()||null,phone:(raw.phone||'').trim()||null,status:raw.status||'new',crm_stage:raw.crm_stage||'new',priority:raw.priority||'normal',total_billed:Number(raw.total_billed||0),notes:(raw.notes||'').trim()||null,next_follow_up_at:raw.next_follow_up_at||null,next_follow_up_type:raw.next_follow_up_at?(raw.next_follow_up_type||'call'):null,next_follow_up_note:raw.next_follow_up_at?((raw.next_follow_up_note||'').trim()||null):null}}
function sortByCreatedDesc(rows=[]){return[...rows].sort((a,b)=>new Date(b.created_at||b.created_date||0).getTime()-new Date(a.created_at||a.created_date||0).getTime())}

export default function Clients(){
 const{formatMoney}=useCurrency();const{canWriteModule}=useWorkspace();const canWriteClients=canWriteModule('clients');
 const{activeBrandId,activeWorkspaceId,adminMode,enabled,fetchRows,ownerEmail,ownerId,queryKey:contextQueryKey,scopedAdminMode,scopedOwnerEmail,scopedOwnerId,user,userProfile,writeOwnerEmail,writeOwnerId}=useWorkContextScope();
 const queryClient=useQueryClient();const[search,setSearch]=useState('');const[statusFilter,setStatusFilter]=useState('all');const[stageFilter,setStageFilter]=useState('all');const[priorityFilter,setPriorityFilter]=useState('all');const[showForm,setShowForm]=useState(false);const[editingClient,setEditingClient]=useState(null);const[selectedClient,setSelectedClient]=useState(null);
 const assertCanWrite=()=>{if(!canWriteClients)throw new Error('No tienes permiso para modificar clientes.')};
 const{data:clients=[],isLoading}=useQuery({queryKey:['clients',...contextQueryKey],queryFn:async()=>sortByCreatedDesc(await fetchRows({table:'clients',orderBy:'created_at',ascending:false})),enabled});
 const{data:invoices=[]}=useQuery({queryKey:['clients-360-invoices',...contextQueryKey],queryFn:()=>fetchRows({table:'invoices'}),enabled});
 const{data:quotes=[]}=useQuery({queryKey:['clients-360-quotes',...contextQueryKey],queryFn:()=>fetchRows({table:'quotes'}),enabled});
 const{data:orders=[]}=useQuery({queryKey:['clients-360-orders',...contextQueryKey],queryFn:()=>fetchRows({table:'orders'}),enabled});
 const{data:appointments=[]}=useQuery({queryKey:['clients-360-appointments',...contextQueryKey],queryFn:()=>fetchRows({table:'appointments'}),enabled});
 const{data:invoicePayments=[]}=useQuery({queryKey:['clients-360-payments',...contextQueryKey],queryFn:()=>fetchRows({table:'invoice_payments'}),enabled});
 const{data:clientActivities=[]}=useQuery({queryKey:['client-activities',...contextQueryKey],queryFn:()=>fetchRows({table:'client_activities',orderBy:'occurred_at',ascending:false}),enabled});
 const{data:reminders=[]}=useQuery({queryKey:['reminders',...contextQueryKey],queryFn:()=>fetchRows({table:'reminders',orderBy:'due_at',ascending:true}),enabled});
 const persistClient=async(data,{targetClient=null}={})=>{assertCanWrite();const now=new Date().toISOString(),basePayload=normalizeClientPayload(data);if(targetClient?.id){await updateOwnedRowById({table:'clients',id:targetClient.id,payload:basePayload,ownerId:scopedOwnerId,ownerEmail:scopedOwnerEmail,adminMode:scopedAdminMode});return{payload:basePayload,remoteUpdatedAt:now}}if(ownerId){try{await ensureDbUserRecord({user,userProfile})}catch(e){console.warn('No se pudo asegurar perfil antes de crear cliente:',e?.message||e)}}const payload={...basePayload,workspace_id:activeWorkspaceId||null,user_id:writeOwnerId,created_by:writeOwnerEmail||null,brand_profile_id:activeBrandId||null,created_at:now,created_date:now};const tryInsert=async candidate=>{const{data,error}=await supabase.from('clients').insert(candidate).select().single();if(!error)return data;for(const col of['workspace_id','user_id','created_by','created_date','created_at','brand_profile_id'])if(isMissingColumnError(error,`clients.${col}`)||isMissingColumnError(error,col)){const next={...candidate};delete next[col];return tryInsert(next)}if(hasOwnerConstraintIssue(error,'clients')){const next={...candidate};delete next.user_id;return tryInsert(next)}throw error};const saved=await tryInsert(payload);return{payload:basePayload,remoteUpdatedAt:saved?.updated_at||now,saved}};
 const saveClientMutation=useMutation({mutationFn:async data=>persistClient(data,{targetClient:editingClient}),onError:error=>toast.error(`No se pudo guardar el cliente: ${error.message}`)});
 const deleteMutation=useMutation({mutationFn:async id=>{assertCanWrite();await deleteOwnedRowById({table:'clients',id,ownerId:scopedOwnerId,ownerEmail:scopedOwnerEmail,adminMode:scopedAdminMode})},onSuccess:()=>{queryClient.invalidateQueries({queryKey:['clients']});toast.success('Cliente eliminado')},onError:error=>toast.error(`No se pudo eliminar el cliente: ${error.message}`)});
 const createActivityMutation=useMutation({
  mutationFn:async({client,payload})=>{
   assertCanWrite();
   const row={
    workspace_id:activeWorkspaceId||null,
    client_id:client.id,
    user_id:writeOwnerId||ownerId||null,
    created_by:writeOwnerEmail||ownerEmail||null,
    activity_type:payload.activity_type||'note',
    subject:(payload.subject||'').trim(),
    notes:(payload.notes||'').trim()||null,
    occurred_at:payload.occurred_at||new Date().toISOString(),
   };
   if(!row.subject)throw new Error('Escribe un asunto para la actividad.');
   const{data,error}=await supabase.from('client_activities').insert(row).select().single();
   if(error)throw error;
   return data;
  },
  onSuccess:()=>{queryClient.invalidateQueries({queryKey:['client-activities']});toast.success('Actividad registrada')},
  onError:error=>toast.error(`No se pudo registrar la actividad: ${error.message}`)
 });
 const deleteActivityMutation=useMutation({
  mutationFn:async(id)=>{assertCanWrite();await deleteOwnedRowById({table:'client_activities',id,ownerId:scopedOwnerId,ownerEmail:scopedOwnerEmail,adminMode:scopedAdminMode})},
  onSuccess:()=>{queryClient.invalidateQueries({queryKey:['client-activities']});toast.success('Actividad eliminada')},
  onError:error=>toast.error(`No se pudo eliminar la actividad: ${error.message}`)
 });
 const updateFollowUpMutation=useMutation({
  mutationFn:async({client,payload})=>{
   assertCanWrite();
   const cleanPayload={
    next_follow_up_at:payload.next_follow_up_at||null,
    next_follow_up_type:payload.next_follow_up_at?(payload.next_follow_up_type||'call'):null,
    next_follow_up_note:payload.next_follow_up_at?((payload.next_follow_up_note||'').trim()||null):null,
   };
   await updateOwnedRowById({table:'clients',id:client.id,payload:cleanPayload,ownerId:scopedOwnerId,ownerEmail:scopedOwnerEmail,adminMode:scopedAdminMode});
   return cleanPayload;
  },
  onSuccess:(payload)=>{
   queryClient.invalidateQueries({queryKey:['clients']});
   setSelectedClient((prev)=>prev?{...prev,...payload}:prev);
   toast.success(payload.next_follow_up_at?'Seguimiento programado':'Seguimiento eliminado');
  },
  onError:error=>toast.error(`No se pudo actualizar el seguimiento: ${error.message}`)
 });
 const createReminderMutation=useMutation({
  mutationFn:async({client,payload})=>{
   assertCanWrite();
   const row={
    workspace_id:activeWorkspaceId||null,
    client_id:client?.id||null,
    user_id:writeOwnerId||ownerId||null,
    created_by:writeOwnerEmail||ownerEmail||null,
    title:(payload.title||'').trim(),
    notes:(payload.notes||'').trim()||null,
    due_at:payload.due_at,
    priority:payload.priority||'normal',
    status:'pending',
    source_type:'client',
    source_id:client?.id||null,
   };
   if(!row.title)throw new Error('Escribe un título para el recordatorio.');
   if(!row.due_at)throw new Error('Selecciona fecha y hora.');
   const{data,error}=await supabase.from('reminders').insert(row).select().single();
   if(error)throw error;
   return data;
  },
  onSuccess:()=>{queryClient.invalidateQueries({queryKey:['reminders']});toast.success('Recordatorio creado')},
  onError:error=>toast.error(`No se pudo crear el recordatorio: ${error.message}`)
 });
 const updateReminderMutation=useMutation({
  mutationFn:async({reminder,payload})=>{
   assertCanWrite();
   const next={...payload,updated_at:new Date().toISOString()};
   if(payload.status==='done'&&!reminder.completed_at)next.completed_at=new Date().toISOString();
   await updateOwnedRowById({table:'reminders',id:reminder.id,payload:next,ownerId:scopedOwnerId,ownerEmail:scopedOwnerEmail,adminMode:scopedAdminMode});
   return next;
  },
  onSuccess:()=>{queryClient.invalidateQueries({queryKey:['reminders']});toast.success('Recordatorio actualizado')},
  onError:error=>toast.error(`No se pudo actualizar el recordatorio: ${error.message}`)
 });
 const deleteReminderMutation=useMutation({
  mutationFn:async(id)=>{assertCanWrite();await deleteOwnedRowById({table:'reminders',id,ownerId:scopedOwnerId,ownerEmail:scopedOwnerEmail,adminMode:scopedAdminMode})},
  onSuccess:()=>{queryClient.invalidateQueries({queryKey:['reminders']});toast.success('Recordatorio eliminado')},
  onError:error=>toast.error(`No se pudo eliminar el recordatorio: ${error.message}`)
 });
 const handleSubmit=async data=>{const result=await saveClientMutation.mutateAsync(data);queryClient.invalidateQueries({queryKey:['clients']});return result};
 const handleEdit=client=>{if(!canWriteClients)return;setEditingClient(client);setShowForm(true)};
 const filtered=clients.filter(c=>(c.name?.toLowerCase().includes(search.toLowerCase())||c.email?.toLowerCase().includes(search.toLowerCase()))&&(statusFilter==='all'||c.status===statusFilter)&&(stageFilter==='all'||c.crm_stage===stageFilter)&&(priorityFilter==='all'||c.priority===priorityFilter));const totalBilled=clients.reduce((s,c)=>s+(c.total_billed||0),0),avgTicket=clients.length?totalBilled/clients.length:0,vipCount=clients.filter(c=>c.status==='vip').length;
 if(isLoading)return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>;
 return <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6"><PageTour pageName="Clients" userEmail={ownerEmail} steps={TOUR_STEPS}/>
 {!canWriteClients&&<Card className="flex items-center gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><Eye className="h-5 w-5"/><div><p className="font-semibold">Modo solo lectura</p><p className="text-xs">Puedes consultar los clientes, pero no crear, editar ni eliminar información.</p></div></Card>}
 <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} className="flex flex-col sm:flex-row justify-between gap-4"><div><h1 className="text-2xl font-bold text-foreground">Clientes</h1><p className="text-sm text-muted-foreground mt-1">Gestiona tus clientes y aumenta tus ingresos. Tus clientes son la base de tu crecimiento.</p></div>{canWriteClients&&<Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto" onClick={()=>{setEditingClient(null);setShowForm(true)}}><Plus className="h-4 w-4 mr-2"/> Nuevo Cliente</Button>}</motion.div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"><Card className="p-4 text-center"><p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Clientes</p><p className="text-2xl font-bold text-primary mt-1">{clients.length}</p></Card><Card className="p-4 text-center"><p className="text-[10px] font-semibold text-muted-foreground uppercase">Ticket Prom.</p><p className="text-2xl font-bold text-foreground mt-1">{formatMoney(avgTicket)}</p></Card><Card className="p-4 text-center"><p className="text-[10px] font-semibold text-muted-foreground uppercase">VIP</p><p className="text-2xl font-bold text-secondary mt-1">{vipCount}</p></Card></div>
 <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_180px_150px]"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="Buscar cliente..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-10"/></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full"><SelectValue placeholder="Categoría"/></SelectTrigger><SelectContent><SelectItem value="all">Todas las categorías</SelectItem><SelectItem value="new">Nuevos</SelectItem><SelectItem value="recurring">Recurrentes</SelectItem><SelectItem value="vip">VIP</SelectItem></SelectContent></Select><Select value={stageFilter} onValueChange={setStageFilter}><SelectTrigger className="w-full"><SelectValue placeholder="Etapa"/></SelectTrigger><SelectContent><SelectItem value="all">Todas las etapas</SelectItem><SelectItem value="new">Nuevo</SelectItem><SelectItem value="follow_up">En seguimiento</SelectItem><SelectItem value="interested">Interesado</SelectItem><SelectItem value="quoted">Cotizado</SelectItem><SelectItem value="negotiation">Negociación</SelectItem><SelectItem value="won">Ganado</SelectItem><SelectItem value="lost">Perdido</SelectItem></SelectContent></Select><Select value={priorityFilter} onValueChange={setPriorityFilter}><SelectTrigger className="w-full"><SelectValue placeholder="Prioridad"/></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="low">Baja</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="urgent">Urgente</SelectItem></SelectContent></Select></div>
 <AnimatePresence>{showForm&&canWriteClients&&<ClientForm key={editingClient?.id||'new-client'} client={editingClient} onSubmit={handleSubmit} onRemoteSave={data=>persistClient(data,{targetClient:editingClient})} onSaved={()=>{setShowForm(false);setEditingClient(null);toast.success(editingClient?.id?'Cliente actualizado':'Cliente creado')}} onCancel={()=>{setShowForm(false);setEditingClient(null)}} isLoading={saveClientMutation.isPending} autosaveUserId={ownerId||ownerEmail||'anon'} remoteUpdatedAt={editingClient?.updated_at||null}/>}</AnimatePresence>
 <ClientTable clients={filtered} onView={setSelectedClient} onEdit={handleEdit} onDelete={id=>deleteMutation.mutate(id)} readOnly={!canWriteClients}/>
 <Client360Dialog
  client={selectedClient}
  open={Boolean(selectedClient)}
  onOpenChange={(open)=>{if(!open)setSelectedClient(null)}}
  invoices={invoices}
  quotes={quotes}
  orders={orders}
  appointments={appointments}
  invoicePayments={invoicePayments}
  activities={clientActivities}
  canWrite={canWriteClients}
  onCreateActivity={(payload)=>createActivityMutation.mutateAsync({client:selectedClient,payload})}
  onDeleteActivity={(id)=>deleteActivityMutation.mutate(id)}
  savingActivity={createActivityMutation.isPending}
  onUpdateFollowUp={(payload)=>updateFollowUpMutation.mutateAsync({client:selectedClient,payload})}
  savingFollowUp={updateFollowUpMutation.isPending}
  reminders={reminders}
  onCreateReminder={(payload)=>createReminderMutation.mutateAsync({client:selectedClient,payload})}
  onCompleteReminder={(reminder)=>updateReminderMutation.mutateAsync({reminder,payload:{status:'done'}})}
  onDismissReminder={(reminder)=>updateReminderMutation.mutateAsync({reminder,payload:{status:'dismissed'}})}
  onDeleteReminder={(id)=>deleteReminderMutation.mutate(id)}
  savingReminder={createReminderMutation.isPending||updateReminderMutation.isPending}
 />
 </div>
}
