"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "ready" | "captured" | "error";
export type CameraFacingMode = "user" | "environment";

export interface UseCameraReturn {
  status: CameraStatus;
  error: string | null;
  stream: MediaStream | null;
  facingMode: CameraFacingMode;
  availableCameras: MediaDeviceInfo[];
  hasMultipleCameras: boolean;
  currentDeviceId: string | null;
  capturedBlob: Blob | null;
  capturedUrl: string | null;
  startCamera: (facing?: CameraFacingMode, deviceId?: string) => Promise<void>;
  stopCamera: () => void;
  switchCamera: () => Promise<void>;
  capture: (videoElement: HTMLVideoElement | null) => Promise<Blob | null>;
  retake: () => Promise<void>;
  confirmPhoto: (fileName?: string) => File | null;
}

export function useCamera(): UseCameraReturn {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const capturedUrlRef = useRef<string | null>(null);
  const availableCamerasRef = useRef<MediaDeviceInfo[]>([]);
  const currentDeviceIdRef = useRef<string | null>(null);

  // Mantener refs sincronizadas para cleanup
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    capturedUrlRef.current = capturedUrl;
  }, [capturedUrl]);

  useEffect(() => {
    availableCamerasRef.current = availableCameras;
  }, [availableCameras]);

  useEffect(() => {
    currentDeviceIdRef.current = currentDeviceId;
  }, [currentDeviceId]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const refreshAvailableCameras = useCallback(async () => {
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      navigator.mediaDevices.enumerateDevices
    ) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((device) => device.kind === "videoinput");
        availableCamerasRef.current = videoInputs;
        setAvailableCameras(videoInputs);
        return videoInputs;
      } catch {
        // Ignorar errores de enumeración de dispositivos si no hay soporte o permisos
      }
    }
    return [];
  }, []);

  const startCamera = useCallback(
    async (facing: CameraFacingMode = facingMode, deviceId?: string) => {
      stopCamera();
      setError(null);
      setStatus("requesting");

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setError("Tu navegador o dispositivo no soporta acceso a la cámara.");
        setStatus("error");
        return;
      }

      // Enumerar cámaras previo a pedir el stream si aún no se listaron
      await refreshAvailableCameras();

      try {
        let mediaStream: MediaStream;

        // Intento 1: Restricción con resolución ideal y deviceId o facingMode ideal
        // (ideal evita OverconstrainedError en dispositivos móviles que no admiten 1080p exacto)
        try {
          const videoConstraints: MediaTrackConstraints = {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          };
          if (deviceId) {
            videoConstraints.deviceId = { exact: deviceId };
          } else {
            videoConstraints.facingMode = { ideal: facing };
          }

          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch {
          // Intento 2: Fallback relajando resolución pero respetando deviceId o facingMode
          try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: deviceId
                ? { deviceId: { exact: deviceId } }
                : { facingMode: { ideal: facing } },
              audio: false,
            });
          } catch {
            // Intento 3: Fallback a video básico si las restricciones específicas del dispositivo fallan
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        // Inspeccionar configuración real del track para no quedar desfasado
        const tracks = typeof mediaStream.getVideoTracks === "function"
          ? mediaStream.getVideoTracks()
          : typeof mediaStream.getTracks === "function"
            ? mediaStream.getTracks()
            : [];
        const videoTrack = tracks[0];
        let actualFacing = facing;
        let actualDeviceId = deviceId ?? null;

        if (videoTrack && typeof videoTrack.getSettings === "function") {
          const settings = videoTrack.getSettings();
          if (settings.facingMode === "user" || settings.facingMode === "environment") {
            actualFacing = settings.facingMode;
          }
          if (settings.deviceId) {
            actualDeviceId = settings.deviceId;
          }
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setFacingMode(actualFacing);
        currentDeviceIdRef.current = actualDeviceId;
        setCurrentDeviceId(actualDeviceId);
        setStatus("ready");

        // Volver a consultar dispositivos ahora que el usuario concedió permisos (revela labels y deviceIds completos)
        await refreshAvailableCameras();
      } catch (err) {
        const errorObj = err as { name?: string; message?: string };
        let msg = "No se pudo acceder a la cámara.";
        if (
          errorObj.name === "NotAllowedError" ||
          errorObj.name === "PermissionDeniedError"
        ) {
          msg = "Permiso denegado para acceder a la cámara. Habilitalo en los permisos del navegador.";
        } else if (
          errorObj.name === "NotFoundError" ||
          errorObj.name === "DevicesNotFoundError"
        ) {
          msg = "No se encontró ninguna cámara conectada en tu dispositivo.";
        }
        setError(msg);
        setStatus("error");
      }
    },
    [facingMode, refreshAvailableCameras, stopCamera],
  );

  const switchCamera = useCallback(async () => {
    const cameras = availableCamerasRef.current.length > 0 ? availableCamerasRef.current : availableCameras;
    const currentId = currentDeviceIdRef.current ?? currentDeviceId;

    // Si tenemos múltiples cámaras enumeradas, ciclar a través de los deviceIds
    if (cameras.length > 1) {
      const currentIndex = cameras.findIndex((c) => c.deviceId === currentId);
      const nextIndex = (currentIndex + 1) % cameras.length;
      const nextDevice = cameras[nextIndex];

      const label = (nextDevice.label || "").toLowerCase();
      const isFront = label.includes("front") || label.includes("frontal") || label.includes("user");
      const isRear = label.includes("back") || label.includes("rear") || label.includes("trasera") || label.includes("environment");
      const nextFacing: CameraFacingMode = isFront
        ? "user"
        : isRear
          ? "environment"
          : facingMode === "user"
            ? "environment"
            : "user";

      await startCamera(nextFacing, nextDevice.deviceId);
    } else {
      // Toggle binario si solo hay facingMode o no se pudieron enumerar IDs
      const nextFacing: CameraFacingMode = facingMode === "user" ? "environment" : "user";
      await startCamera(nextFacing);
    }
  }, [availableCameras, currentDeviceId, facingMode, startCamera]);

  const capture = useCallback(
    async (videoElement: HTMLVideoElement | null): Promise<Blob | null> => {
      if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) return null;

      // Si es cámara frontal (selfie), espejar horizontalmente para vista natural
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        if (canvas.toBlob) {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
        } else {
          resolve(null);
        }
      });

      if (blob) {
        // Limpiar URL previa si existía
        if (capturedUrlRef.current) {
          URL.revokeObjectURL(capturedUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedUrl(url);
        setStatus("captured");
        // Apagar cámara en vivo para ahorrar batería y apagar el sensor
        stopCamera();
        return blob;
      }

      return null;
    },
    [facingMode, stopCamera],
  );

  const retake = useCallback(async () => {
    if (capturedUrlRef.current) {
      URL.revokeObjectURL(capturedUrlRef.current);
    }
    setCapturedBlob(null);
    setCapturedUrl(null);
    await startCamera(facingMode, currentDeviceId ?? undefined);
  }, [currentDeviceId, facingMode, startCamera]);

  const confirmPhoto = useCallback(
    (fileName?: string): File | null => {
      if (!capturedBlob) return null;
      const name = fileName || `foto_camara_${Date.now()}.jpg`;
      return new File([capturedBlob], name, { type: "image/jpeg" });
    },
    [capturedBlob],
  );

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (capturedUrlRef.current) {
        URL.revokeObjectURL(capturedUrlRef.current);
      }
    };
  }, []);

  return {
    status,
    error,
    stream,
    facingMode,
    availableCameras,
    hasMultipleCameras: availableCameras.length > 1,
    currentDeviceId,
    capturedBlob,
    capturedUrl,
    startCamera,
    stopCamera,
    switchCamera,
    capture,
    retake,
    confirmPhoto,
  };
}
