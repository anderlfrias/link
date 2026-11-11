"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconAlertTriangle, IconCheck, IconCopy, IconDownload, IconSend, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ChatTargetPicker } from "@/features/conversations/components/ChatTargetPicker";
import type { ChatTarget } from "@/features/conversations/utils/chat-target";
import { QrCode } from "@/features/mobile-app/components/QrCode";
import { CONNECT_CARD_FILENAME, useShareConnectCard } from "@/features/mobile-app/hooks/use-share-connect-card";
import { downloadBlob, renderConnectCardPng } from "@/features/mobile-app/utils/connect-card-image";
import { buildConnectLink, isSecureOrigin, normalizeSiteOrigin } from "@/features/mobile-app/utils/connect-link";
import { buildQrMatrix } from "@/features/mobile-app/utils/qr-matrix";
import { useAuth } from "@/providers/auth-provider";
import { copyTextToClipboard } from "@/utils/clipboard";
import { useTranslation } from "@/i18n";

interface ConnectMobileAppModalProps {
  onClose: () => void;
  /** Dirección del sitio a mostrar. Por defecto, la que la persona está usando
   * ahora mismo: es la que sabe que funciona desde donde está. */
  siteUrl?: string;
}

const COPIED_FEEDBACK_MS = 2000;

/**
 * "Conectar app móvil": muestra la dirección de esta instalación y su QR para
 * vincular la app, con copiar, descargar como imagen y compartir dentro de LINK.
 *
 * Lo que se muestra y se comparte es solo la dirección del sitio (ver
 * `connect-link.ts`): no depende de quién lo abre ni lleva nada de su sesión,
 * así que cualquier persona puede pasárselo a otra.
 */
export function ConnectMobileAppModal({ onClose, siteUrl }: ConnectMobileAppModalProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { share, pending, error: shareError } = useShareConnectCard();
  const [view, setView] = useState<"details" | "share">("details");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const origin = useMemo(
    () => normalizeSiteOrigin(siteUrl ?? (typeof window === "undefined" ? "" : window.location.origin)),
    [siteUrl],
  );
  const matrix = useMemo(() => (origin ? buildQrMatrix(buildConnectLink(origin)) : null), [origin]);

  if (!session || !origin || !matrix) return null;

  const card = { matrix, url: origin, title: t("mobileApp.cardTitle"), hint: t("mobileApp.cardHint") };

  async function handleCopy() {
    if (!origin || !(await copyTextToClipboard(origin))) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  async function handleDownload() {
    setNotice(null);
    try {
      downloadBlob(await renderConnectCardPng(card), CONNECT_CARD_FILENAME);
    } catch {
      setNotice({ kind: "error", text: t("mobileApp.imageError") });
    }
  }

  async function handleShare(targets: ChatTarget[]) {
    setImageError(null);
    let image: Blob;
    try {
      image = await renderConnectCardPng(card);
    } catch {
      setImageError(t("mobileApp.imageError"));
      return;
    }

    const sent = await share({ image, text: t("mobileApp.shareMessage", { url: card.url }) }, targets);
    if (sent === targets.length) {
      setView("details");
      setNotice({ kind: "success", text: t("mobileApp.shareSent") });
    }
  }

  if (view === "share") {
    return (
      <Modal onClose={onClose} aria-label={t("mobileApp.shareInLink")}>
        <ChatTargetPicker
          title={t("mobileApp.shareInLink")}
          currentUserId={session.user.internalUserId}
          submitLabel={(count) =>
            count > 0 ? t("mobileApp.shareCountButton", { count }) : t("mobileApp.shareButton")
          }
          onSubmit={handleShare}
          onClose={() => setView("details")}
          pending={pending}
          error={imageError ?? shareError}
        />
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} aria-label={t("mobileApp.title")}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="truncate font-display text-lg font-semibold text-brand-ink dark:text-white">
          {t("mobileApp.title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <IconX size={20} stroke={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t("mobileApp.intro")}</p>

        {!isSecureOrigin(origin) && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
          >
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{t("mobileApp.insecureWarning")}</span>
          </div>
        )}

        <p className="mt-4 text-sm font-medium text-brand-ink dark:text-white">{t("mobileApp.stepScan")}</p>
        <div className="mt-2 flex justify-center">
          <QrCode
            matrix={matrix}
            label={t("mobileApp.qrLabel")}
            className="h-56 w-56 rounded-xl border border-black/5 dark:border-white/10"
          />
        </div>

        <p className="mt-4 text-sm font-medium text-brand-ink dark:text-white">{t("mobileApp.stepUrl")}</p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
          <span className="min-w-0 flex-1 break-all font-mono text-sm text-brand-ink dark:text-white">{origin}</span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? t("common.copied") : t("mobileApp.copyUrl")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {copied ? <IconCheck size={18} stroke={1.75} /> : <IconCopy size={18} stroke={1.75} />}
          </button>
        </div>

        {notice && (
          <p
            role="status"
            className={
              notice.kind === "success"
                ? "mt-3 text-sm text-emerald-600 dark:text-emerald-400"
                : "mt-3 text-sm text-red-600 dark:text-red-400"
            }
          >
            {notice.text}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-black/5 px-4 py-3 sm:flex-row dark:border-white/10">
        <Button
          type="button"
          className="flex-1"
          onClick={() => {
            setNotice(null);
            setView("share");
          }}
        >
          <IconSend size={16} stroke={1.75} />
          {t("mobileApp.shareInLink")}
        </Button>
        <Button type="button" variant="ghost" className="flex-1" onClick={handleDownload}>
          <IconDownload size={16} stroke={1.75} />
          {t("mobileApp.downloadImage")}
        </Button>
      </div>
    </Modal>
  );
}
