"use client";

import { FileTypeMultiSelect } from "@/features/admin/components/FileTypeMultiSelect";
import type { FileTypeRestrictionMode } from "@/features/admin/types/admin-settings.types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useTranslation } from "@/i18n";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { SettingsField, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsSectionProps } from "./settings-section.types";

export function AttachmentsSection({ draft, errors, updateField }: SettingsSectionProps) {
  const { t } = useTranslation();
  // `chunkedUploads` dice si hay subida por partes (S3). Mientras no cargó (`null`) no se muestra la nota.
  const publicSettings = usePublicSettings();

  return (
    <>
      <SettingsGroup title={t("admin.settings.attachmentsLimitsTitle")}>
        <SettingsField label={t("admin.settings.maxUploadSizeMb")}>
          <Input
            type="number"
            min={1}
            value={draft.maxUploadSizeMb}
            onChange={(event) => updateField("maxUploadSizeMb", event.target.value)}
            error={errors.maxUploadSizeMb}
          />
          {publicSettings && !publicSettings.chunkedUploads && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400" data-testid="max-upload-no-s3-note">
              {t("admin.settings.maxUploadSizeNoS3Note")}
            </span>
          )}
        </SettingsField>
        <SettingsField label={t("admin.settings.maxFilesPerMessage")}>
          <Input
            type="number"
            min={1}
            value={draft.maxFilesPerMessage}
            onChange={(event) => updateField("maxFilesPerMessage", event.target.value)}
            error={errors.maxFilesPerMessage}
          />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title={t("admin.settings.fileTypesTitle")}>
        <SettingsField label={t("admin.settings.fileTypeRestrictionMode")}>
          <Select
            value={draft.fileTypeRestrictionMode}
            onChange={(event) => updateField("fileTypeRestrictionMode", event.target.value as FileTypeRestrictionMode)}
          >
            <option value="DISABLED">{t("admin.settings.restrictionDisabled")}</option>
            <option value="ALLOWLIST">{t("admin.settings.restrictionAllowlist")}</option>
            <option value="BLOCKLIST">{t("admin.settings.restrictionBlocklist")}</option>
          </Select>
        </SettingsField>
        {draft.fileTypeRestrictionMode !== "DISABLED" && (
          <FileTypeMultiSelect
            label={
              draft.fileTypeRestrictionMode === "ALLOWLIST"
                ? t("admin.settings.allowedTypes")
                : t("admin.settings.blockedTypes")
            }
            value={draft.fileTypeSelection}
            onChange={(next) => updateField("fileTypeSelection", next)}
          />
        )}
      </SettingsGroup>
    </>
  );
}
