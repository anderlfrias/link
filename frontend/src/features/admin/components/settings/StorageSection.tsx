"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/i18n";
import { SettingsField, SettingsGroup, SettingsHint, SettingsNested } from "./SettingsPrimitives";
import type { SettingsSectionProps } from "./settings-section.types";

export function StorageSection({ draft, errors, updateField }: SettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <>
      <SettingsGroup title={t("admin.settings.cleanupTitle")}>
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={draft.uploadCleanupEnabled}
            onChange={(event) => updateField("uploadCleanupEnabled", event.target.checked)}
            label={t("admin.settings.uploadCleanupEnabled")}
          />
          <SettingsHint>{t("admin.settings.uploadCleanupDesc")}</SettingsHint>
        </div>

        {draft.uploadCleanupEnabled && (
          <SettingsNested>
            <SettingsField label={t("admin.settings.orphanFileRetentionHours")}>
              <Input
                type="number"
                min={1}
                placeholder={t("admin.settings.orphanRetentionPlaceholder")}
                value={draft.orphanFileRetentionHours}
                onChange={(event) => updateField("orphanFileRetentionHours", event.target.value)}
                error={errors.orphanFileRetentionHours}
              />
            </SettingsField>

            <SettingsField label={t("admin.settings.softDeletedFilePurgeDays")}>
              <Input
                type="number"
                min={1}
                placeholder={t("admin.settings.softDeletedPurgePlaceholder")}
                value={draft.softDeletedFilePurgeDays}
                onChange={(event) => updateField("softDeletedFilePurgeDays", event.target.value)}
                error={errors.softDeletedFilePurgeDays}
              />
            </SettingsField>

            <Checkbox
              checked={draft.uploadCleanupDryRun}
              onChange={(event) => updateField("uploadCleanupDryRun", event.target.checked)}
              label={t("admin.settings.uploadCleanupDryRun")}
            />
          </SettingsNested>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("admin.settings.migrationTitle")}>
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={draft.fileMigrationEnabled}
            onChange={(event) => updateField("fileMigrationEnabled", event.target.checked)}
            label={t("admin.settings.fileMigrationEnabled")}
          />
          <SettingsHint>{t("admin.settings.fileMigrationDesc")}</SettingsHint>
        </div>

        {draft.fileMigrationEnabled && (
          <SettingsNested>
            <SettingsField label={t("admin.settings.fileMigrationBatchSize")}>
              <Input
                type="number"
                min={1}
                max={500}
                value={draft.fileMigrationBatchSize}
                onChange={(event) => updateField("fileMigrationBatchSize", event.target.value)}
                error={errors.fileMigrationBatchSize}
              />
            </SettingsField>

            <SettingsField label={t("admin.settings.fileMigrationIntervalMinutes")}>
              <Input
                type="number"
                min={1}
                value={draft.fileMigrationIntervalMinutes}
                onChange={(event) => updateField("fileMigrationIntervalMinutes", event.target.value)}
                error={errors.fileMigrationIntervalMinutes}
              />
            </SettingsField>

            <div className="flex flex-col gap-1">
              <Checkbox
                checked={draft.fileMigrationDeleteLocalAfterCommit}
                onChange={(event) => updateField("fileMigrationDeleteLocalAfterCommit", event.target.checked)}
                label={t("admin.settings.fileMigrationDeleteLocalAfterCommit")}
              />
              <SettingsHint>{t("admin.settings.fileMigrationDeleteLocalDesc")}</SettingsHint>
            </div>
          </SettingsNested>
        )}
      </SettingsGroup>
    </>
  );
}
