/**
 * pages.config.js - Page routing configuration
 */
import AdminPanel from './pages/AdminPanel';
import Billing from './pages/Billing';
import AppSettings from './pages/AppSettings';
import WorkspaceSettings from './pages/WorkspaceSettings';
import Clients from './pages/Clients';
import Dashboard from './pages/Dashboard';
import Imports from './pages/Imports';
import Inventory from './pages/Inventory';
import MonthlyControl from './pages/MonthlyControl';
import Onboarding from './pages/Onboarding';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Profitability from './pages/Profitability';
import Projection from './pages/Projection';
import Receivables from './pages/Receivables';
import Reports from './pages/Reports';
import __Layout from './Layout.jsx';

export const PAGES = {
    "AdminPanel": AdminPanel,
    "Billing": Billing,
    "AppSettings": AppSettings,
    "WorkspaceSettings": WorkspaceSettings,
    "Clients": Clients,
    "Dashboard": Dashboard,
    "Imports": Imports,
    "Inventory": Inventory,
    "MonthlyControl": MonthlyControl,
    "Onboarding": Onboarding,
    "Orders": Orders,
    "Products": Products,
    "Profitability": Profitability,
    "Projection": Projection,
    "Receivables": Receivables,
    "Reports": Reports,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
