declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/**
 * Dispara um evento customizado para o Google Analytics 4.
 * Se o GA4 não estiver configurado (sem VITE_GA_MEASUREMENT_ID), a chamada é ignorada silenciosamente.
 */
export function trackEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, params);
  }
}
