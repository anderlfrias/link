"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconDownload, IconX } from "@tabler/icons-react";
import { downloadFile } from "@/utils/download-file";

export interface LightboxItem {
  url: string;
  name: string;
  /** Por defecto "image". */
  kind?: "image" | "video";
}

interface ImageLightboxContextValue {
  /** Abre el visor en `item`. Con `album` (fotos y videos que se enviaron juntos) se puede pasar
   * de uno a otro; `item` tiene que ser uno de ellos (se busca por `url`). */
  open: (item: LightboxItem, album?: LightboxItem[]) => void;
}

const ImageLightboxContext = createContext<ImageLightboxContextValue | null>(null);

interface LightboxState {
  items: LightboxItem[];
  index: number;
}

/**
 * Visor de foto o video a pantalla completa, estilo WhatsApp/Telegram: tocar la
 * miniatura de una foto en el chat la abre acá en vez de navegar a una
 * pestaña nueva. Vive como provider (no como estado local de cada burbuja)
 * porque el overlay es uno solo para toda la conversación.
 */
export function ImageLightboxProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null);

  const open = useCallback((item: LightboxItem, album?: LightboxItem[]) => {
    const items = album && album.length > 0 ? album : [item];
    const index = Math.max(
      0,
      items.findIndex((candidate) => candidate.url === item.url),
    );
    setState({ items, index });
  }, []);
  const close = useCallback(() => setState(null), []);

  const hasMultiple = (state?.items.length ?? 0) > 1;
  const step = useCallback((delta: number) => {
    setState((prev) =>
      prev ? { ...prev, index: (prev.index + delta + prev.items.length) % prev.items.length } : prev,
    );
  }, []);

  const isOpen = state !== null;
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close, step]);

  const value = useMemo(() => ({ open }), [open]);
  const current = state ? state.items[state.index] : null;
  const isVideo = current?.kind === "video";

  return (
    <ImageLightboxContext.Provider value={value}>
      {children}
      {state && current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.name}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <IconX size={22} stroke={1.75} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void downloadFile(current.url, current.name);
            }}
            aria-label={isVideo ? "Descargar video" : "Descargar imagen"}
            className="absolute right-16 top-4 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <IconDownload size={20} stroke={1.75} />
          </button>
          {hasMultiple && (
            <>
              <span
                aria-live="polite"
                className="absolute left-4 top-6 text-sm font-medium text-white/80"
              >
                {state.index + 1} / {state.items.length}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  step(-1);
                }}
                aria-label="Anterior"
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/90 transition-colors hover:bg-white/20"
              >
                <IconChevronLeft size={24} stroke={1.75} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  step(1);
                }}
                aria-label="Siguiente"
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/90 transition-colors hover:bg-white/20"
              >
                <IconChevronRight size={24} stroke={1.75} />
              </button>
            </>
          )}
          {isVideo ? (
            <video
              key={current.url}
              src={current.url}
              aria-label={current.name}
              controls
              autoPlay
              playsInline
              onClick={(event) => event.stopPropagation()}
              className="max-h-full max-w-full rounded-lg shadow-2xl"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={current.url}
              src={current.url}
              alt={current.name}
              onClick={(event) => event.stopPropagation()}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          )}
        </div>
      )}
    </ImageLightboxContext.Provider>
  );
}

export function useImageLightbox(): ImageLightboxContextValue {
  const context = useContext(ImageLightboxContext);
  if (!context) {
    throw new Error("useImageLightbox debe usarse dentro de un ImageLightboxProvider");
  }
  return context;
}
