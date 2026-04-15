import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

// Features available by plan
const PLAN_FEATURES = {
  admin: { luna: true, automatizaciones: true, nuevas_funciones: true },
  subscription: { luna: true, automatizaciones: true, nuevas_funciones: true },
  founder: { luna: false, automatizaciones: false, nuevas_funciones: false },
};

export function useFeatureGate() {
  const { userProfile } = useAuth();
  const [user, setUser] = useState(userProfile);
  const [loading, setLoading] = useState(!userProfile);

  useEffect(() => {
    setUser(userProfile);
    setLoading(false);
  }, [userProfile]);

  const hasFeature = (featureName) => {
    if (!user) return false;
    const plan = user.plan || 'founder';

    // Admin always has everything
    if (user.role === 'admin' || plan === 'admin') return true;

    // Check manual feature override first
    if (user.features && user.features[featureName] !== undefined) {
      return user.features[featureName];
    }

    // Fall back to plan defaults
    return PLAN_FEATURES[plan]?.[featureName] ?? false;
  };

  const plan = user?.plan || 'founder';
  const isAdmin = user?.role === 'admin' || plan === 'admin';
  const isSubscription = plan === 'subscription';
  const isFounder = plan === 'founder' && !isAdmin;

  return { hasFeature, plan, isAdmin, isSubscription, isFounder, user, loading };
}

// Call this after updating user to refresh cache
export function invalidateUserCache() {
  cachedUser = null;
}