"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

function isRunningStandalone() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(navigatorWithStandalone.standalone)
  );
}

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => isRunningStandalone());

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setShowInstructions(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }

    setShowInstructions((currentValue) => !currentValue);
  }

  if (isInstalled) {
    return null;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleInstallClick}
        className="inline-flex w-full items-center justify-center rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:border-green-400 hover:text-green-400 sm:w-auto"
      >
        Descargar app
      </button>

      {showInstructions ? (
        <p className="max-w-xs rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300">
          En iPhone: abri Safari, toca Compartir y elegi Agregar a inicio. En
          Android: usa Chrome y elegi Instalar app o Agregar a pantalla
          principal.
        </p>
      ) : null}
    </div>
  );
}
