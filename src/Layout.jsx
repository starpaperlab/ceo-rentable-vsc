import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { CurrencyProvider } from '@/components/shared/CurrencyContext';
import CurrencySelector from '@/components/shared/CurrencySelector';
import ThemeToggle from '@/components/shared/ThemeToggle';
import {
  LayoutDashboard,
  Calculator,
  Package,
  TrendingUp,
  Users,
  CalendarCheck,
  FileBarChart,
  GraduationCap,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronRight,
  Shield,
  Receipt,
  Boxes,
  Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_ITEMS = [
  { name: 'Dashboard', page: 'Dashboard', icon: LayoutDashboard },
  { name: 'Rentabilidad', page: 'Profitability', icon: Calculator },
  { name: 'Productos', page: 'Products', icon: Package },
  { name: 'Proyección', page: 'Projection', icon: TrendingUp },
  { name: 'Clientes', page: 'Clients', icon: Users },
  { name: 'Agenda Inteligente', page: 'Agenda', icon: Calendar },
  { name: 'Control Mensual', page: 'MonthlyControl', icon: CalendarCheck },
  { name: 'Facturación', page: 'Billing', icon: Receipt },
  { name: 'Inventario', page: 'Inventory', icon: Boxes },
  { name: 'Reportes', page: 'Reports', icon: FileBarChart },
  { name: 'Aprende', page: 'Learn', icon: GraduationCap },
  { name: 'Configuración', page: 'AppSettings', icon: Settings },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { userProfile, logout, isAdmin } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <CurrencyProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 border-r border-sidebar-border bg-sidebar shrink-0">
          <div className="p-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <img 
                src="/brand/isotipo.png" 
                alt="CEO Rentable OS" 
                className="w-9 h-9 object-contain"
              />
              <div>
                <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">
                  CEO <span className="text-primary">Rentable</span> OS™
                </h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Plataforma Financiera</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-sidebar-accent text-primary'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                  {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
                </Link>
              );
            })}
          </nav>

          {isAdmin?.() && (
            <div className="px-3 pb-2">
              <Link
                to={createPageUrl('AdminPanel')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  currentPageName === 'AdminPanel'
                    ? 'bg-sidebar-accent text-primary'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
              >
                <Shield className="h-4 w-4" />
                Admin Panel
              </Link>
            </div>
          )}

          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                {userProfile?.full_name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{userProfile?.full_name || 'Usuario'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{userProfile?.email || ''}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleLogout}>
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </aside>

        {/* Mobile Overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-40 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                className="fixed inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar z-50 lg:hidden flex flex-col"
              >
                <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img 
                      src="/brand/isotipo.png" 
                      alt="CEO Rentable OS" 
                      className="w-9 h-9 object-contain"
                    />
                    <h1 className="text-sm font-bold text-sidebar-foreground">CEO <span className="text-primary">Rentable</span> OS™</h1>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                  {NAV_ITEMS.map((item) => {
                    const isActive = currentPageName === item.page;
                    return (
                      <Link
                        key={item.page}
                        to={createPageUrl(item.page)}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? 'bg-sidebar-accent text-primary'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                  {isAdmin?.() && (
                    <Link
                      to={createPageUrl('AdminPanel')}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        currentPageName === 'AdminPanel'
                          ? 'bg-sidebar-accent text-primary'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
                      }`}
                    >
                      <Shield className="h-4 w-4" />
                      Admin Panel
                    </Link>
                  )}
                </nav>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <h2 className="text-sm font-semibold text-foreground hidden sm:block">
                {NAV_ITEMS.find(n => n.page === currentPageName)?.name || currentPageName}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <CurrencySelector />
              <ThemeToggle />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </CurrencyProvider>
  );
}