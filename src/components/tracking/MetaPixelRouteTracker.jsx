import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initializeMetaPixel, trackPageView } from '@/lib/metaPixel';

export default function MetaPixelRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    initializeMetaPixel();
  }, []);

  useEffect(() => {
    trackPageView({
      path: `${location.pathname}${location.search}${location.hash}`,
    });
  }, [location.hash, location.pathname, location.search]);

  return null;
}
