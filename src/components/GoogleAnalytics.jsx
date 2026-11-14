import React, { Component, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackRoute } from '../lib/metaPixel';
import { captureSignupSource } from '../lib/signupSource'; // v418

const GA_MEASUREMENT_ID = 'G-YQXC5TWFS0';

function TrackLocation() {
  const location = useLocation();

  useEffect(() => {
    trackRoute(location?.pathname); // v362: Meta Pixel PageView + funnel page events
    captureSignupSource(); // v418: ad tags on a later page (e.g. /offer?utm_…) count too; tags stay in the address bar
    if (typeof window !== 'undefined' && window.gtag && location) {
      window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: (location.pathname || '') + (location.search || ''),
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [location?.pathname, location?.search]);

  return null;
}

class GoogleAnalyticsBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Suppress analytics error so it never affects application UI
    console.warn("Analytics tracking suppressed:", error?.message);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function GoogleAnalytics() {
  return (
    <GoogleAnalyticsBoundary>
      <TrackLocation />
    </GoogleAnalyticsBoundary>
  );
}

