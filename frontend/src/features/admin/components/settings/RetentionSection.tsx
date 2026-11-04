"use client";

import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/i18n";
import { SettingsField, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsSectionProps } from "./settings-section.types";

export function RetentionSection({ draft, errors, updateField }: SettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <>
      <SettingsGroup title={t("admin.settings.messageRetentionTitle")}>
        <SettingsField label={t("admin.settings.messageRetentionDays")}>
          <Input
            type="number"
            min={0}
            value={draft.messageRetentionDays}
            onChange={(event) => updateField("messageRetentionDays", event.target.value)}
            error={errors.messageRetentionDays}
          />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title={t("admin.settings.auditRetentionTitle")}>
        <SettingsField label={t("admin.settings.auditLogRetentionDays")}>
          <Input
            type="number"
            min={1}
            value={draft.auditLogRetentionDays}
            onChange={(event) => updateField("auditLogRetentionDays", event.target.value)}
            error={errors.auditLogRetentionDays}
          />
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {t("admin.settings.auditRetentionWarning")}
          </span>
        </SettingsField>
      </SettingsGroup>
    </>
  );
}
