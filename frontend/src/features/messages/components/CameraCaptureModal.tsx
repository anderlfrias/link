"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconCamera,
  IconCheck,
  IconLoader2,
  IconRefresh,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { useCamera } from "@/features/messages/hooks/use-camera";
import { useStreamRecorder } from "@/features/messages/hooks/use-stream-recorder";
import { formatDuration } from "@/utils/format-duration";
import { cn } from "@/utils/cn";

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  /** Todo lo capturado en la sesión (fotos y videos), de una sola vez al tocar "Listo". */
  onCapture: (files: File[]) => void;
}

type CaptureMode = "photo" | "video";

interface CapturedItem {
  id: number;
  file: File;
  /** URL de objeto para la miniatura (solo fotos). */
  url: string | null;
}

/**
 * Cámara dentro de la app: se pueden sacar varias fotos y grabar varios videos sin salir del visor
 * (cada captura queda en la tira de abajo), y recién al tocar "Listo" se agregan todos al mensaje.
 */
export function CameraCaptureModal({ open, onClose, onCapture }: CameraCaptureModalProps) {
  const {
    status,
    error,
    stream,
    facingMode,
    currentDeviceId,
    hasAudio,
    startCamera,
    stopCamera,
    switchCamera,
    capture,
  } = useCamera();
  const recorder = useStreamRecorder(stream);

  const videoRef = useRef<HTMLVideoElement>(null);
  const nextIdRef = useRef(1);
  const [mode, setMode] = useState<CaptureMode>("photo");
  const [items, setItems] = useState<CapturedItem[]>([]);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Las funciones del hook cambian de identidad cuando cambia la cámara activa: se leen por ref
  // para que abrir/cerrar el modal sea lo único que enciende o apaga la cámara.
  const startRef = useRef(startCamera);
  const stopRef = useRef(stopCamera);
  const cancelRecordingRef = useRef(recorder.cancel);
  useEffect(() => {
    startRef.current = startCamera;
    stopRef.current = stopCamera;
    cancelRecordingRef.current = recorder.cancel;
  });

  // Al abrir: cámara en modo foto. Al cerrar: se apaga todo y se descarta lo que no se agregó.
  useEffect(() => {
    if (open) {
      setMode("photo");
      void startRef.current(undefined, undefined, false);
      return;
    }
    cancelRecordingRef.current();
    stopRef.current();
    setItems((prev) => {
      prev.forEach((item) => item.url && URL.revokeObjectURL(item.url));
      return [];
    });
    setRecordError(null);
  }, [open]);

  // Conectar el stream al elemento de video
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        // Ignorar interrupciones si se cierra rápido
      });
    }
  }, [stream]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function addItem(file: File) {
    const url = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setItems((prev) => [...prev, { id: nextIdRef.current++, file, url }]);
  }

  function removeItem(id: number) {
    setItems((prev) => {
      const removed = prev.find((item) => item.id === id);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return prev.filter((item) => item.id !== id);
    });
  }

  async function handleChangeMode(next: CaptureMode) {
    if (next === mode || recorder.recording) return;
    setMode(next);
    setRecordError(null);
    // El micrófono solo se pide en modo video: en modo foto no hace falta.
    await startCamera(facingMode, currentDeviceId ?? undefined, next === "video");
  }

  async function handleShutter() {
    if (mode === "photo") {
      const file = await capture(videoRef.current);
      if (file) addItem(file);
      return;
    }
    if (recorder.recording) {
      const file = await recorder.stop();
      if (file) addItem(file);
      else setRecordError("No se grabó nada. Probá de nuevo.");
      return;
    }
    setRecordError(null);
    if (!recorder.start()) setRecordError("No se pudo iniciar la grabación en este dispositivo.");
  }

  function handleDone() {
    if (items.length === 0) return;
    onCapture(items.map((item) => item.file));
    onClose();
  }

  const isReady = status === "ready";
  const photoCount = items.filter((item) => item.file.type.startsWith("image/")).length;
  const videoCount = items.length - photoCount;
  const summary = [
    photoCount > 0 ? `${photoCount} ${photoCount === 1 ? "foto" : "fotos"}` : null,
    videoCount > 0 ? `${videoCount} ${videoCount === 1 ? "video" : "videos"}` : null,
  ]
    .filter(Boolean)
    .join(" y ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cámara"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black sm:bg-black/80 p-0 sm:p-4 sm:backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative flex h-[100dvh] w-full sm:h-auto sm:max-w-lg flex-col overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border border-white/10 bg-black sm:bg-neutral-900 text-white shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-neutral-950/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-2 font-medium text-sm">
            <IconCamera size={18} className="text-brand-blue" />
            <span>{mode === "video" ? "Grabar video" : "Tomar fotografía"}</span>
          </div>
          <div className="flex items-center gap-1">
            {(isReady || status === "requesting") && (
              <button
                type="button"
                onClick={() => void switchCamera()}
                disabled={recorder.recording}
                title="Cambiar cámara (frontal / trasera)"
                aria-label="Cambiar cámara"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <IconRefresh size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar cámara"
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <IconX size={18} />
            </button>
          </div>
        </div>

        {/* Visor de cámara */}
        <div className="relative flex-1 w-full min-h-0 sm:flex-none sm:aspect-[4/3] overflow-hidden bg-black flex items-center justify-center">
          {status === "requesting" && (
            <div className="flex flex-col items-center gap-2 text-neutral-400">
              <IconLoader2 size={32} className="animate-spin text-brand-blue" />
              <span className="text-xs">Iniciando cámara...</span>
            </div>
          )}

          {status === "error" && (
            <div className="flex max-w-xs flex-col items-center gap-3 p-6 text-center text-neutral-300">
              <IconAlertCircle size={36} className="text-red-400" />
              <p className="text-xs">{error ?? "Ocurrió un error al acceder a la cámara."}</p>
              <button
                type="button"
                onClick={() => void startCamera(facingMode, undefined, mode === "video")}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
              >
                Reintentar
              </button>
            </div>
          )}

          {isReady && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label="Visor de cámara"
              className={cn(
                "h-full w-full object-cover",
                facingMode === "user" && "-scale-x-100", // Efecto espejo para selfies
              )}
            />
          )}

          {isReady && recorder.recording && (
            <div
              role="timer"
              aria-label="Tiempo de grabación"
              className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium"
            >
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="tabular-nums">{formatDuration(recorder.elapsedMs)}</span>
            </div>
          )}

          {isReady && mode === "video" && !hasAudio && !recorder.recording && (
            <p className="absolute inset-x-3 top-3 rounded-lg bg-black/60 px-3 py-1.5 text-center text-xs text-amber-300">
              Sin micrófono: el video se grabará sin sonido.
            </p>
          )}
        </div>

        {/* Lo capturado hasta ahora */}
        {items.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-white/10 bg-neutral-950/90 px-3 py-2">
            {items.map((item, index) => (
              <div key={item.id} className="relative h-14 w-14 shrink-0">
                {item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={`Foto ${index + 1}`}
                    className="h-full w-full rounded-lg object-cover"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={`Video ${index + 1}`}
                    className="flex h-full w-full items-center justify-center rounded-lg bg-white/10 text-white/80"
                  >
                    <IconVideo size={22} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Quitar ${item.url ? "foto" : "video"} ${index + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-white shadow transition-colors hover:bg-red-500"
                >
                  <IconX size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <p role="status" className="sr-only">
          {summary ? `${summary} listos para agregar` : ""}
        </p>
        {recordError && (
          <p role="alert" className="shrink-0 bg-red-500/15 px-4 py-1.5 text-center text-xs text-red-300">
            {recordError}
          </p>
        )}

        {/* Barra de acciones inferior */}
        <div className="flex items-center justify-center border-t border-white/10 bg-neutral-950/80 backdrop-blur-md px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0 z-10">
          {isReady && (
            <div className="relative flex w-full items-center justify-center">
              {recorder.supported && !recorder.recording && (
                <div
                  role="group"
                  aria-label="Modo de captura"
                  className="absolute left-0 flex rounded-full bg-white/10 p-0.5 text-xs font-medium"
                >
                  {(["photo", "video"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={mode === option}
                      onClick={() => void handleChangeMode(option)}
                      className={cn(
                        "rounded-full px-3 py-1.5 transition-colors",
                        mode === option ? "bg-white text-neutral-900" : "text-neutral-300 hover:text-white",
                      )}
                    >
                      {option === "photo" ? "Foto" : "Video"}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleShutter()}
                aria-label={mode === "photo" ? "Tomar foto" : recorder.recording ? "Detener grabación" : "Grabar video"}
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 p-1 shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                <div
                  className={cn(
                    "shadow transition-all",
                    mode === "video"
                      ? recorder.recording
                        ? "h-6 w-6 rounded-md bg-red-500"
                        : "h-full w-full rounded-full bg-red-500"
                      : "h-full w-full rounded-full bg-white",
                  )}
                />
              </button>

              {items.length > 0 && !recorder.recording && (
                <button
                  type="button"
                  onClick={handleDone}
                  aria-label={`Agregar ${summary}`}
                  className="absolute right-0 flex items-center gap-1.5 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow transition-all hover:bg-brand-blue/90"
                >
                  <IconCheck size={16} />
                  <span>Listo ({items.length})</span>
                </button>
              )}
            </div>
          )}

          {(status === "requesting" || status === "error") && (
            <div className="h-10 flex items-center">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-neutral-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
