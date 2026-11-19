"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Formatos de video que se prueban, del preferido al menos. Safari solo graba mp4. */
const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return VIDEO_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

/**
 * Graba video de un `MediaStream` que ya está abierto (el de la cámara, ver `use-camera.ts`) con
 * `MediaRecorder`. No toca el stream: lo enciende y apaga quien lo creó. Sin subir nada — `stop()`
 * devuelve el `File` y quien llama decide qué hacer con él.
 */
export function useStreamRecorder(stream: MediaStream | null) {
  const supported = typeof MediaRecorder !== "undefined";
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!stream || !supported || recorderRef.current) return false;
    try {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
      return true;
    } catch {
      return false;
    }
  }, [stream, supported]);

  /** Termina de grabar y devuelve el video como `File` (`null` si no se grabó nada). */
  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        clearTimer();
        recorderRef.current = null;
        setRecording(false);
        // "video/webm;codecs=vp9,opus" → "video/webm": el backend valida el tipo base.
        const mimeType = (recorder.mimeType || "video/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (blob.size === 0) {
          resolve(null);
          return;
        }
        const extension = mimeType.includes("mp4") ? "mp4" : "webm";
        resolve(new File([blob], `video_camara_${Date.now()}.${extension}`, { type: mimeType }));
      };
      recorder.stop();
    });
  }, [clearTimer]);

  /** Descarta la grabación en curso sin devolver nada. */
  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    clearTimer();
    chunksRef.current = [];
    setRecording(false);
    setElapsedMs(0);
  }, [clearTimer]);

  // Si se desmonta a mitad de una grabación, no dejar el recorder ni el timer colgados.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { supported, recording, elapsedMs, start, stop, cancel };
}
