export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Running as the installed (home screen) app. */
export const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
