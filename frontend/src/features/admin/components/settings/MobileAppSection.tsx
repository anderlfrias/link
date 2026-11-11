"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/i18n";
import { ORGANIZATION_NAME_MAX_LENGTH } from "@/features/admin/utils/admin-settings-draft";
import { SettingsField, SettingsGroup, SettingsHint } from "./SettingsPrimitives";
import type { SettingsSectionProps } from "./settings-section.types";

/** Si la organización acepta la app móvil y cómo se llama al vincularla. */
export function MobileAppSection({ draft, errors, updateField }: SettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <>
      <SettingsGroup title={t("admin.settings.mobileAppAccessTitle")}>
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={draft.allowMobileApp}
            onChange={(event) => updateField("allowMobileApp", event.target.checked)}
            label={t("admin.settings.allowMobileApp")}
          />
          <SettingsHint>{t("admin.settings.allowMobileAppDesc")}</SettingsHint>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("admin.settings.organizationNameTitle")}>
        <SettingsField label={t("admin.settings.organizationName")}>
          <Input
            type="text"
            maxLength={ORGANIZATION_NAME_MAX_LENGTH}
            value={draft.organizationName}
            onChange={(event) => updateField("organizationName", event.target.value)}
            error={errors.organizationName}
          />
        </SettingsField>
        <SettingsHint>{t("admin.settings.organizationNameDesc")}</SettingsHint>
      </SettingsGroup>
    </>
  );
}
