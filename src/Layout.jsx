import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { CurrencyProvider } from '@/components/shared/CurrencyContext';
import CurrencySelector from '@/components/shared/CurrencySelector';
import ThemeToggle from '@/components/shared/ThemeToggle';
import WorkContextSelector from '@/components/shared/WorkContextSelector';
import { LayoutDashboard, ShoppingBag, Users, Package, WalletCards, CalendarDays, FileBarChart, Settings, Menu, X, LogOut, ChevronRight, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

// CEO Rentable 2.0: navegación por trabajo del negocio, no por funciones técnicas.
// Las rutas existentes se conservan para no romper módulos durante la migración.
const NAV_ITEMS = [
  { name: 'Inicio', page: 'Dashboard', icon: LayoutDashboard },
  { name: 'Ventas', page: 'Orders', icon: ShoppingBag },
  { name: 'Clientes', page: 'Clients', icon: Users },
  { name: 'Productos/Servicios', page: 'Products', icon: Package },
  { name: 'Finanzas', page: 'MonthlyControl', icon: WalletCards },
  { name: 'Calendario/Actividades', page: 'Agenda', icon: CalendarDays },
  { name: 'Reportes', page: 'Reports', icon: FileBarChart },
  { name: 'Configuración', page: 'AppSettings', icon: Settings },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { userProfile, logout, isAdmin } = useAuth();
  const userEmail = userProfile?.email || '';
  const userName = userProfile?.full_name || userEmail || 'Usuario';
  const businessName = userProfile?.business_name || userProfile?.company_name || userProfile?.business?.name || 'Mi empresa';
  const planLabel = userProfile?.plan ? `Plan ${userProfile.plan}` : userProfile?.has_access ? 'Acceso activo' : 'Sin plan activo';
  const userInitial = `${userName || userEmail || 'U'}`.trim()[0]?.toUpperCase() || 'U';

  const handleLogout = async () => { setSidebarOpen(false); await logout(); };
  const nav = (close = false) => NAV_ITEMS.map((item) => {
    const active = currentPageName === item.page;
    return <Link key={item.page} to={createPageUrl(item.page)} onClick={close ? () => setSidebarOpen(false) : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-sidebar-accent text-primary' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}><item.icon className="h-4 w-4" />{item.name}{active && !close && <ChevronRight className="ml-auto h-3.5 w-3.5" />}</Link>;
  });

  return <CurrencyProvider><div className="flex h-[100dvh] overflow-hidden bg-background">
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="border-b border-sidebar-border p-5"><div className="flex items-center gap-3"><img src="/brand/isotipo.png" alt="CEO Rentable OS" className="h-9 w-9 object-contain"/><div className="min-w-0"><h1 className="text-sm font-bold text-sidebar-foreground">CEO <span className="text-primary">Rentable</span> OS™</h1><p className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">{businessName}</p></div></div></div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">{nav()}</nav>
      {isAdmin?.() && <div className="px-3 pb-2"><Link to={createPageUrl('AdminPanel')} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50"><Shield className="h-4 w-4"/>Administración CEO</Link></div>}
      <div className="border-t border-sidebar-border p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{userInitial}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-sidebar-foreground">{userName}</p><p className="truncate text-[10px] text-muted-foreground">{planLabel}</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}><LogOut className="h-3.5 w-3.5"/></Button></div></div>
    </aside>

    <AnimatePresence>{sidebarOpen && <><motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={()=>setSidebarOpen(false)}/><motion.aside initial={{x:-300}} animate={{x:0}} exit={{x:-300}} transition={{type:'spring',damping:25,stiffness:250}} className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col border-r border-sidebar-border bg-sidebar lg:hidden"><div className="flex items-center justify-between border-b border-sidebar-border p-5"><div className="flex min-w-0 items-center gap-3"><img src="/brand/isotipo.png" alt="CEO Rentable OS" className="h-9 w-9"/><div className="min-w-0"><p className="text-sm font-bold">CEO <span className="text-primary">Rentable</span></p><p className="truncate text-xs text-muted-foreground">{businessName}</p></div></div><Button variant="ghost" size="icon" onClick={()=>setSidebarOpen(false)}><X className="h-5 w-5"/></Button></div><nav className="flex-1 space-y-1 overflow-y-auto p-3">{nav(true)}</nav><div className="border-t border-sidebar-border p-4"><div className="rounded-2xl border border-sidebar-border p-3"><p className="truncate text-sm font-semibold">{userName}</p><p className="truncate text-xs text-muted-foreground">{userEmail}</p><Button variant="outline" size="sm" className="mt-3 w-full gap-2" onClick={handleLogout}><LogOut className="h-3.5 w-3.5"/>Cerrar sesión</Button></div></div></motion.aside></>}</AnimatePresence>

    <div className="flex min-w-0 flex-1 flex-col overflow-hidden"><header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/90 px-3 backdrop-blur-sm sm:px-4 lg:px-6"><div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 lg:hidden" onClick={()=>setSidebarOpen(true)}><Menu className="h-5 w-5"/></Button><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-foreground">{NAV_ITEMS.find(n=>n.page===currentPageName)?.name || currentPageName}</h2><p className="hidden truncate text-[11px] text-muted-foreground sm:block">{businessName}</p></div></div><div className="flex shrink-0 items-center gap-1 sm:gap-2"><div className="hidden md:block"><WorkContextSelector/></div><CurrencySelector/><ThemeToggle/></div></header><main className="flex-1 overflow-y-auto overscroll-contain">{children}</main></div>
  </div></CurrencyProvider>;
}
