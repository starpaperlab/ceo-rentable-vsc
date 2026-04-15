import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function AdminRouteGuard({ children }) {
  const { isLoadingAuth, isLoadingProfile, isAdmin } = useAuth();

  if (isLoadingAuth || isLoadingProfile) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin?.()) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
