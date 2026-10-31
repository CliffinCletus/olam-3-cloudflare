import { Share, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { isIOS, isStandalone } from "../lib/device";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

// Chrome fires beforeinstallprompt early, sometimes before React mounts: capture it globally.
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((l) => l());
  });
}


/** "Add to Home Screen": Android/desktop Chrome get the native install prompt; iPhone gets Safari instructions. */
export function InstallApp() {
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => { listeners.delete(l); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return null;
  const ios = isIOS();
  if (!deferred && !ios) return null;

  return (
    <div className="install">
      <button
        type="button"
        className="install-btn"
        data-testid="install-app-btn"
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            await deferred.userChoice.catch(() => null);
            deferred = null;
            force((n) => n + 1);
          } else setHelp((v) => !v);
        }}
      >
        <Smartphone />Add OLAM 3.0 to your home screen
      </button>
      {help ? (
        <p className="help" data-testid="install-ios-help">
          In Safari, tap the Share button <Share style={{ width: 14, height: 14, verticalAlign: -2 }} aria-label="Share" />, then choose “Add to Home Screen”.
        </p>
      ) : null}
    </div>
  );
}
