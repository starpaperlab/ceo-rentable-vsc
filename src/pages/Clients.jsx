import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/components/shared/CurrencyContext';
import ClientTable from '@/components/clients/ClientTable';
import ClientForm from '@/components/clients/ClientForm';
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
function normalizeClientPayload(raw={}){return{name:(raw.name||'').trim(),email:(raw.email||'').trim()||null,phone:(raw.phone||'').trim()||null,status:raw.status||'new',total_billed:Number(raw.total_billed||0),notes:(raw.notes||'').trim()||null}}
function sortByCreatedDesc(rows=[]){return[...rows].sort((a,b)=>new Date(b.created_at||b.created_date||0).getTime()-new Date(a.created_at||a.created_date||0).getTime())}

export default function Clients(){
 const{formatMoney}=useCurrency();const{canWrite}=useWorkspace();
 const{activeBrandId,activeWorkspaceId,adminMode,enabled,fetchRows,ownerEmail,ownerId,queryKey:contextQueryKey,scopedAdminMode,scopedOwnerEmail,scopedOwnerId,user,userProfile,writeOwnerEmail,writeOwnerId}=useWorkContextScope();
 const queryClient=useQueryClient();const[search,setSearch]=useState('');const[statusFilter,setStatusFilter]=useState('all');const[showForm,setShowForm]=useState(false);const[editingClient,setEditingClient]=useState(null);
 const assertCanWrite=()=>{if(!canWrite)throw new Error('Tu perfil es de solo lectura. No puedes crear, editar ni eliminar información.')};
 const{data:clients=[],isLoading}=useQuery({queryKey:['clients',...contextQueryKey],queryFn:async()=>sortByCreatedDesc(await fetchRows({table:'clients',orderBy:'created_at',ascending:false})),enabled});
 const persistClient=async(data,{targetClient=null}={})=>{assertCanWrite();const now=new Date().toISOString(),basePayload=normalizeClientPayload(data);if(targetClient?.id){await updateOwnedRowById({table:'clients',id:targetClient.id,payload:basePayload,ownerId:scopedOwnerId,ownerEmail:scopedOwnerEmail,adminMode:scopedAdminMode});return{payload:basePayload,remoteUpdatedAt:now}}if(ownerId){try{await ensureDbUserRecord({user,userProfile})}catch(e){console.warn('No se pudo asegurar perfil antes de crear cliente:',e?.message||e)}}const payload={...basePayload,workspace_id:activeWorkspaceId||null,user_id:writeOwnerId,created_by:writeOwnerEmail||null,brand_profile_id:activeBrandId||null,created_at:now,created_date:now};const tryInsert=async candidate=>{const{data,error}=await supabase.from('clients').insert(candidate).select().single();if(!error)return data;for(const col of['workspace_id','user_id','created_by','created_date','created_at','brand_profile_id'])if(isMissingColumnError(error,`clients.${col}`)||isMissingColumnError(error,col)){const next={...candidate};delete next[col];return tryInsert(next)}if(hasOwnerConstraintIssue(error,'clients')){const next={...candidate};delete next.user_id;return tryInsert(next)}throw error};const saved=await tryInsert(payload);return{payload:basePayload,remoteUpdatedAt:saved?.updated_at||now,saved}};
 const saveClientMutation=useMutation({mutationFn:async data=>persistClient(data,{targetClient:editingClient}),onError:error=>toast.error(`No se pudo guardar el cliente: ${error.message}`)});
 const deleteMutation=useMutation({mutationFn:async id=>{assertCanWrite();await deleteOwnedRowById({table:'clients',id,ownerId:scopedOwnerId,ownerEmail:scopedOwnerEmail,adminMode:scopedAdminMode})},onSuccess:()=>{queryClient.invalidateQueries({queryKey:['clients']});toast.success('Cliente eliminado')},onError:error=>toast.error(`No se pudo eliminar el cliente: ${error.message}`)});
 const handleSubmit=async data=>{const result=await saveClientMutation.mutateAsync(data);queryClient.invalidateQueries({queryKey:['clients']});return result};
 const handleEdit=client=>{if(!canWrite)return;setEditingClient(client);setShowForm(true)};
 const filtered=clients.filter(c=>(c.name?.toLowerCase().includes(search.toLowerCase())||c.email?.toLowerCase().includes(search.toLowerCase()))&&(statusFilter==='all'||c.status===statusFilter));const totalBilled=clients.reduce((s,c)=>s+(c.total_billed||0),0),avgTicket=clients.length?totalBilled/clients.length:0,vipCount=clients.filter(c=>c.status==='vip').length;
 if(isLoading)return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>;
 return <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6"><PageTour pageName="Clients" userEmail={ownerEmail} steps={TOUR_STEPS}/>
 {!canWrite&&<Card className="flex items-center gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><Eye className="h-5 w-5"/><div><p className="font-semibold">Modo solo lectura</p><p className="text-xs">Puedes consultar los clientes, pero no crear, editar ni eliminar información.</p></div></Card>}
 <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} className="flex flex-col sm:flex-row justify-between gap-4"><div><h1 className="text-2xl font-bold text-foreground">Clientes</h1><p className="text-sm text-muted-foreground mt-1">Gestiona tus clientes y aumenta tus ingresos. Tus clientes son la base de tu crecimiento.</p></div>{canWrite&&<Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto" onClick={()=>{setEditingClient(null);setShowForm(true)}}><Plus className="h-4 w-4 mr-2"/> Nuevo Cliente</Button>}</motion.div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"><Card className="p-4 text-center"><p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Clientes</p><p className="text-2xl font-bold text-primary mt-1">{clients.length}</p></Card><Card className="p-4 text-center"><p className="text-[10px] font-semibold text-muted-foreground uppercase">Ticket Prom.</p><p className="text-2xl font-bold text-foreground mt-1">{formatMoney(avgTicket)}</p></Card><Card className="p-4 text-center"><p className="text-[10px] font-semibold text-muted-foreground uppercase">VIP</p><p className="text-2xl font-bold text-secondary mt-1">{vipCount}</p></Card></div>
 <div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="Buscar cliente..." value={search} onChange={e=>setSearch(e.target.value)} className="pl-10"/></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Estado"/></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="new">Nuevos</SelectItem><SelectItem value="recurring">Recurrentes</SelectItem><SelectItem value="vip">VIP</SelectItem></SelectContent></Select></div>
 <AnimatePresence>{showForm&&canWrite&&<ClientForm key={editingClient?.id||'new-client'} client={editingClient} onSubmit={handleSubmit} onRemoteSave={data=>persistClient(data,{targetClient:editingClient})} onSaved={()=>{setShowForm(false);setEditingClient(null);toast.success(editingClient?.id?'Cliente actualizado':'Cliente creado')}} onCancel={()=>{setShowForm(false);setEditingClient(null)}} isLoading={saveClientMutation.isPending} autosaveUserId={ownerId||ownerEmail||'anon'} remoteUpdatedAt={editingClient?.updated_at||null}/>}</AnimatePresence>
 <ClientTable clients={filtered} onEdit={handleEdit} onDelete={id=>deleteMutation.mutate(id)} readOnly={!canWrite}/></div>
}
