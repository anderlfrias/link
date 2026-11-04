"use client";

import { useEffect, useState } from "react";
import { IconAlertCircle, IconArrowLeft, IconChevronRight, IconLoader2 } from "@tabler/icons-react";
import { useAdminSettings } from "@/features/admin/hooks/use-admin-settings";
import { useUpdateAdminSettings } from "@/features/admin/hooks/use-update-admin-settings";
import {
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_GROUPS,
  type SettingsSection,
  type SettingsSectionId,
} from "@/features/admin/constants/admin-settings-sections.constant";
import {
  passwordWarnings,
  sessionWarnings,
  toDraft,
  toPayload,
  validate,
  type DraftState,
} from "@/features/admin/utils/admin-settings-draft";
import { AttachmentsSection } from "@/features/admin/components/settings/AttachmentsSection";
import { GroupsSection } from "@/features/admin/components/settings/GroupsSection";
import { MessagesSection } from "@/features/admin/components/settings/MessagesSection";
import { RetentionSection } from "@/features/admin/components/settings/RetentionSection";
import { SecuritySection } from "@/features/admin/components/settings/SecuritySection";
import { StorageSection } from "@/features/admin/components/settings/StorageSection";
import { Button } from "@/components/ui/Button";
import { useAuthCapabilities } from "@/providers/auth-config-provider";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

/// Configuración global del admin, con el patrón de los ajustes de WhatsApp/Telegram: una lista de
/// secciones agrupadas por tema y, al elegir una, su detalle. En desktop (`lg`) lista y detalle van
/// lado a lado; en mobile/tablet se navega de la lista al detalle y se vuelve con la flecha.
/// Hay un solo borrador y un solo "Guardar cambios" para todas las secciones.
export function AdminSettingsPanel() {
  const { t } = useTranslation();
  // Las contraseñas se administran acá solo con cuentas locales: lo dice `GET /auth/config`.
  const { passwordChange: passwordPolicy } = useAuthCapabilities();
  const { settings, status, error: loadError, refetch } = useAdminSettings();
  const { save, pending, error: saveError } = useUpdateAdminSettings();

  const [draft, setDraft] = useState<DraftState | null>(null);
  // En desktop siempre hay una sección abierta; en mobile `view` decide si se ve la lista o el detalle.
  const [selected, setSelected] = useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id);
  const [view, setView] = useState<"list" | "detail">("list");

  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [settings]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <IconLoader2 className="animate-spin text-brand-blue" size={28} />
      </div>
    );
  }

  if (status === "error" || !settings || !draft) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertCircle size={18} className="shrink-0" />
          <span>{loadError || t("admin.settings.loadError")}</span>
        </div>
        <Button type="button" variant="ghost" onClick={refetch}>
          {t("admin.retry")}
        </Button>
      </div>
    );
  }

  const errors = validate(draft, (key, params) => t(key as any, params), passwordPolicy);
  const hasErrors = Object.keys(errors).length > 0;
  const savedDraft = toDraft(settings);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const sessionNotes = sessionWarnings(draft, savedDraft);
  const passwordNotes = passwordPolicy ? passwordWarnings(draft, savedDraft) : [];

  function updateField<K extends keyof DraftState>(field: K, value: DraftState[K]) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSave() {
    if (hasErrors || !draft) return;
    const updated = await save(toPayload(draft, passwordPolicy));
    if (updated) setDraft(toDraft(updated));
  }

  function openSection(id: SettingsSectionId) {
    setSelected(id);
    setView("detail");
  }

  /** Marcas de la lista: una sección con errores o con cambios sin guardar se nota sin abrirla. */
  function sectionStatus(section: SettingsSection): "error" | "changed" | null {
    if (!draft) return null;
    if (section.fields.some((field) => errors[field])) return "error";
    if (section.fields.some((field) => JSON.stringify(draft[field]) !== JSON.stringify(savedDraft[field]))) {
      return "changed";
    }
    return null;
  }

  const activeSection = SETTINGS_SECTIONS.find((section) => section.id === selected) ?? SETTINGS_SECTIONS[0];
  const sectionProps = { draft, errors, updateField };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "min-h-0 flex-col border-black/5 dark:border-white/10 lg:flex lg:w-80 lg:shrink-0 lg:border-r",
            view === "list" ? "flex w-full" : "hidden",
          )}
        >
          <h2 className="px-4 pb-2 pt-4 font-display text-lg font-semibold text-brand-ink dark:text-white">
            {t("admin.settings.title")}
          </h2>
          <nav aria-label={t("admin.settings.title")} className="flex-1 overflow-y-auto px-3 pb-4">
            {SETTINGS_SECTION_GROUPS.map((group) => {
              const sections = SETTINGS_SECTIONS.filter((section) => section.group === group.id);
              return (
                <div key={group.id} className="mt-3 first:mt-0">
                  <p className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {t(`admin.settings.${group.labelKey}`)}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {sections.map((section) => {
                      const Icon = section.icon;
                      const sectionState = sectionStatus(section);
                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            onClick={() => openSection(section.id)}
                            aria-current={section.id === selected ? "true" : undefined}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                              section.id === selected && "lg:bg-black/5 lg:dark:bg-white/10",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                                section.tint,
                              )}
                            >
                              <Icon size={20} stroke={1.75} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-brand-ink dark:text-white">
                                {t(`admin.settings.${section.titleKey}`)}
                              </span>
                              <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                                {t(`admin.settings.${section.descriptionKey}`)}
                              </span>
                            </span>
                            {sectionState && (
                              <span
                                className={cn(
                                  "h-2 w-2 shrink-0 rounded-full",
                                  sectionState === "error" ? "bg-red-500" : "bg-brand-blue",
                                )}
                              >
                                <span className="sr-only">
                                  {t(
                                    sectionState === "error"
                                      ? "admin.settings.sectionHasErrors"
                                      : "admin.settings.sectionHasChanges",
                                  )}
                                </span>
                              </span>
                            )}
                            <IconChevronRight
                              size={16}
                              stroke={1.75}
                              className="shrink-0 text-neutral-400 lg:hidden dark:text-neutral-500"
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </div>

        <div className={cn("min-h-0 min-w-0 flex-1 flex-col lg:flex", view === "detail" ? "flex" : "hidden")}>
          <div className="flex items-center gap-2 px-4 pb-2 pt-4">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label={t("common.back")}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-ink hover:bg-black/5 lg:hidden dark:text-white dark:hover:bg-white/10"
            >
              <IconArrowLeft size={20} stroke={1.75} />
            </button>
            <div className="min-w-0">
              <h3 className="truncate font-display text-lg font-semibold text-brand-ink dark:text-white">
                {t(`admin.settings.${activeSection.titleKey}`)}
              </h3>
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {t(`admin.settings.${activeSection.descriptionKey}`)}
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <div className="flex max-w-xl flex-col gap-4">
              {activeSection.id === "messages" && <MessagesSection {...sectionProps} />}
              {activeSection.id === "groups" && <GroupsSection {...sectionProps} />}
              {activeSection.id === "attachments" && <AttachmentsSection {...sectionProps} />}
              {activeSection.id === "retention" && <RetentionSection {...sectionProps} />}
              {activeSection.id === "storage" && <StorageSection {...sectionProps} />}
              {activeSection.id === "security" && (
                <SecuritySection
                  {...sectionProps}
                  passwordPolicy={passwordPolicy}
                  sessionNotes={sessionNotes}
                  passwordNotes={passwordNotes}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-black/5 px-4 py-3 dark:border-white/10">
        {saveError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          {isDirty && (
            <span className="hidden text-xs text-neutral-500 sm:inline dark:text-neutral-400">
              {t("admin.settings.unsavedChanges")}
            </span>
          )}
          <Button
            type="button"
            disabled={!isDirty || hasErrors || pending}
            onClick={handleSave}
            className="w-full sm:w-auto"
          >
            {pending && <IconLoader2 className="animate-spin" size={16} />}
            {t("admin.saveChanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}
