import React from 'react';
import { useAccessGuard } from '@/hooks/useAccessGuard';
import Paywall from '@/pages/Paywall';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

export default function AccessGuard({ children }) {
  const { user, hasAccess, isLoading, isRegistered } = useAccessGuard();

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (user && !isRegistered) {
    return <UserNotRegisteredError />;
  }

  if (!hasAccess) {
    return <Paywall />;
  }

  return <>{children}</>;
}
