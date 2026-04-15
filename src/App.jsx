import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import PaymentSuccess from './pages/PaymentSuccess';
import Acceso from './pages/Acceso';
import PaymentCancel from './pages/PaymentCancel';
import ManualPaymentConfirmation from './pages/ManualPaymentConfirmation';
import EmailLogs from './pages/EmailLogs';
import EmailTemplates from './pages/EmailTemplates';
import Learn from './pages/Learn';
import Diagnostico from './pages/Diagnostico';
import Agenda from './pages/Agenda';
import Paywall from './pages/Paywall';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Login from '@/pages/Login';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AccessGuard from '@/components/shared/AccessGuard';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const GuardedLayoutWrapper = ({ children, currentPageName }) => (
  <AccessGuard>
    <LayoutWrapper currentPageName={currentPageName}>{children}</LayoutWrapper>
  </AccessGuard>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, user } = useAuth();

  // Show loading spinner while checking auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/diagnostico" element={<Diagnostico />} />
      <Route path="/acceso" element={<Acceso />} />
      <Route path="/paywall" element={<Paywall />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/payment-cancel" element={<PaymentCancel />} />
      <Route path="/manual-payment" element={<ManualPaymentConfirmation />} />

      {user ? (
        <>
          <Route path="/" element={
            <GuardedLayoutWrapper currentPageName={mainPageKey}>
              <MainPage />
            </GuardedLayoutWrapper>
          } />
          {Object.entries(Pages).map(([path, Page]) => (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <GuardedLayoutWrapper currentPageName={path}>
                  <Page />
                </GuardedLayoutWrapper>
              }
            />
          ))}
          <Route path="/admin/emails" element={<EmailLogs />} />
          <Route path="/admin/email-templates" element={<EmailTemplates />} />
          <Route path="/Learn" element={<GuardedLayoutWrapper currentPageName="Learn"><Learn /></GuardedLayoutWrapper>} />
          <Route path="/agenda" element={<GuardedLayoutWrapper currentPageName="Agenda"><Agenda /></GuardedLayoutWrapper>} />
        </>
      ) : (
        <Route path="*" element={<Login />} />
      )}

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <Router>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <AuthenticatedApp />
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </Router>
  )
}

export default App
