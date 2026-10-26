import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView, trackInitiateCheckout, revokeMetaPixelConsent } from '@/lib/metaPixel';
import { getMarketingConsent, MARKETING_CONSENT_EVENT, MARKETING_CONSENT_KEY } from '@/lib/marketingConsent';
export default function MetaPixelRouteTracker() {
  const location = useLocation();
  useEffect(() => {
    const track = () => {
      if (getMarketingConsent() !== 'granted') {revokeMetaPixelConsent();return;}
      trackPageView({path:`${location.pathname}${location.search}`});
      if (location.pathname.toLowerCase() === '/checkout') {
        const plan = new URLSearchParams(location.search).get('plan');
        trackInitiateCheckout(['monthly','annual'].includes(plan) ? plan : 'annual');
      }
    };
    const storage = e => {if(e.key === MARKETING_CONSENT_KEY) track();};
    track();window.addEventListener(MARKETING_CONSENT_EVENT,track);window.addEventListener('storage',storage);
    return () => {window.removeEventListener(MARKETING_CONSENT_EVENT,track);window.removeEventListener('storage',storage);};
  }, [location.pathname,location.search]);
  return null;
}
