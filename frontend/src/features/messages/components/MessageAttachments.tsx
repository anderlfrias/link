"use client";

import { IconDownload, IconFileOff, IconPlayerPlayFilled } from "@tabler/icons-react";
import { FileTypeIcon } from "@/features/files/components/FileTypeIcon";
import { VoiceNotePlayer } from "@/features/messages/components/VoiceNotePlayer";
import { useImageLightbox, type LightboxItem } from "@/features/messages/providers/image-lightbox-provider";
import { resolveFileUrl } from "@/utils/file-url";
import { downloadFile } from "@/utils/download-file";
import {
  formatFileName,
  formatFileSize,
  isAudioMimeType,
  isImageMimeType,
  isVideoMimeType,
} from "@/utils/file-format";
import { cn } from "@/utils/cn";
import type { MessageFile } from "@/features/messages/types/message.types";

interface MessageAttachmentsProps {
  files: MessageFile[];
  isOwn: boolean;
}

/** Con más de 3 fotos/videos en el mismo mensaje se agrupan en una cuadrícula (como WhatsApp/Telegram). */
const MIN_GROUPED_MEDIA = 4;
/** Cuántas miniaturas muestra la cuadrícula: la última lleva "+N" si hay más. */
const MAX_GRID_TILES = 4;

/** Cuadrícula de fotos y videos enviados juntos. Tocar una miniatura abre el visor sobre todo el
 * grupo, para pasar de una a otra (incluidas las que la cuadrícula no muestra). */
function MediaGrid({ files }: { files: MessageFile[] }) {
  const { open: openLightbox } = useImageLightbox();
  const album: LightboxItem[] = files.map(({ file }) => ({
    url: resolveFileUrl(file),
    name: formatFileName(file.originalName),
    kind: isVideoMimeType(file.mimeType) ? "video" : "image",
  }));
  const visible = album.slice(0, MAX_GRID_TILES);
  const hiddenCount = album.length - visible.length;

  return (
    <div
      role="group"
      aria-label={`${album.length} fotos y videos`}
      className="grid w-full grid-cols-2 gap-0.5 overflow-hidden rounded-lg"
    >
      {visible.map((item, index) => {
        const isOverflowTile = hiddenCount > 0 && index === visible.length - 1;
        const isVideo = item.kind === "video";
        const label = isOverflowTile
          ? `Ver ${item.name} y ${hiddenCount} más`
          : `${isVideo ? "Ver video" : "Ver imagen"} ${item.name}`;
        return (
          <button
            key={item.url}
            type="button"
            onClick={() => openLightbox(item, album)}
            aria-label={label}
            className="relative aspect-square cursor-pointer overflow-hidden border-0 bg-black/10 p-0 dark:bg-white/10"
          >
            {isVideo ? (
              // `#t=0.001` hace que el navegador (iOS incluido) muestre el primer cuadro como miniatura.
              <video
                src={`${item.url}#t=0.001`}
                preload="metadata"
                muted
                playsInline
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt="" loading="eager" className="h-full w-full object-cover" />
            )}
            {isVideo && !isOverflowTile && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white">
                  <IconPlayerPlayFilled size={18} />
                </span>
              </span>
            )}
            {isOverflowTile && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">
                +{hiddenCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Adjuntos de un mensaje ya enviado: imágenes en línea (en cuadrícula si son más de 3 fotos/videos), el resto como tarjeta descargable. */
export function MessageAttachments({ files, isOwn }: MessageAttachmentsProps) {
  const { open: openLightbox } = useImageLightbox();

  if (files.length === 0) return null;

  const media = files.filter(
    ({ file }) => !file.deletedAt && (isImageMimeType(file.mimeType) || isVideoMimeType(file.mimeType)),
  );
  const grouped = media.length >= MIN_GROUPED_MEDIA;
  const groupedIds = new Set(grouped ? media.map((entry) => entry.id) : []);

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-1.5">
      {grouped && <MediaGrid files={media} />}
      {files.filter((entry) => !groupedIds.has(entry.id)).map(({ id, file }) => {
        const displayName = formatFileName(file.originalName);

        // El archivo fue borrado físicamente desde el panel de admin — nunca
        // intentar renderizar imagen/audio/descarga para un mimetype que ya
        // no existe en el servidor, mismo criterio visual que "Mensaje
        // eliminado" en MessageBubble.tsx (itálica, gris apagado).
        if (file.deletedAt) {
          return (
            <div
              key={id}
              className={cn(
                "flex w-full max-w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left",
                isOwn ? "border-white/25" : "border-black/10 dark:border-white/10",
              )}
            >
              <IconFileOff size={22} stroke={1.5} className="shrink-0 opacity-50" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-xs font-medium italic text-neutral-400 dark:text-neutral-500" title={displayName}>
                  {displayName}
                </p>
                <p className="text-[11px] italic text-neutral-400 dark:text-neutral-500">
                  Este archivo ya no está disponible: fue eliminado.
                </p>
              </div>
            </div>
          );
        }

        const url = resolveFileUrl(file);

        if (isImageMimeType(file.mimeType)) {
          return (
            <button
              key={id}
              type="button"
              onClick={() => openLightbox({ url, name: displayName })}
              aria-label={`Ver imagen ${displayName}`}
              className="block w-full max-w-full cursor-pointer overflow-hidden rounded-lg border-0 bg-transparent p-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={displayName}
                loading="eager"
                className="max-h-64 min-h-[140px] w-full object-cover rounded-lg bg-black/5 dark:bg-white/5"
              />
            </button>
          );
        }

        if (isAudioMimeType(file.mimeType)) {
          return <VoiceNotePlayer key={id} url={url} filename={displayName} isOwn={isOwn} />;
        }

        return (
          <button
            key={id}
            type="button"
            onClick={() => downloadFile(url, displayName)}
            className={cn(
              "flex w-full max-w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
              isOwn
                ? "border-white/25 hover:bg-white/10"
                : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10",
            )}
          >
            <FileTypeIcon mimeType={file.mimeType} size={22} className="shrink-0" />
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-xs font-medium" title={displayName}>{displayName}</p>
              <p className={cn("text-[11px]", isOwn ? "text-white/70" : "text-neutral-400 dark:text-neutral-500")}>
                {formatFileSize(file.size)}
              </p>
            </div>
            <IconDownload size={16} className="shrink-0 opacity-70" />
          </button>
        );
      })}
    </div>
  );
}
