"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/i18n";
import {
  LOCAL_AUTH_RANGES,
  type PasswordWarning,
  type SessionWarning,
} from "@/features/admin/utils/admin-settings-draft";
import { SettingsField, SettingsGroup, SettingsHint } from "./SettingsPrimitives";
import type { SettingsSectionProps } from "./settings-section.types";

interface SecuritySectionProps extends SettingsSectionProps {
  /** Las contraseñas se administran en LINK solo con cuentas locales; con un proveedor externo no se muestran. */
  passwordPolicy: boolean;
  sessionNotes: SessionWarning[];
  passwordNotes: PasswordWarning[];
}

function WarningList({
  warnings,
  testId,
}: {
  warnings: (SessionWarning | PasswordWarning)[];
  testId: string;
}) {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      {warnings.map((warning) => (
        <p
          key={warning}
          className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{t(`admin.settings.${warning}`)}</span>
        </p>
      ))}
    </div>
  );
}

export function SecuritySection({
  draft,
  errors,
  updateField,
  passwordPolicy,
  sessionNotes,
  passwordNotes,
}: SecuritySectionProps) {
  const { t } = useTranslation();

  return (
    <>
      <SettingsGroup
        testId="session-settings"
        title={t("admin.settings.sessionTitle")}
        description={t("admin.settings.sessionDesc")}
      >
        <SettingsField label={t("admin.settings.localSessionTtlHours")}>
          <Input
            type="number"
            min={LOCAL_AUTH_RANGES.localSessionTtlHours.min}
            max={LOCAL_AUTH_RANGES.localSessionTtlHours.max}
            value={draft.localSessionTtlHours}
            onChange={(event) => updateField("localSessionTtlHours", event.target.value)}
            error={errors.localSessionTtlHours}
          />
        </SettingsField>
        <WarningList warnings={sessionNotes} testId="session-warnings" />
      </SettingsGroup>

      {passwordPolicy && (
        <>
          <SettingsGroup
            testId="password-settings"
            title={t("admin.settings.passwordsTitle")}
            description={t("admin.settings.passwordsDesc")}
          >
            <SettingsField label={t("admin.settings.passwordMinLength")}>
              <Input
                type="number"
                min={LOCAL_AUTH_RANGES.passwordMinLength.min}
                max={LOCAL_AUTH_RANGES.passwordMinLength.max}
                value={draft.passwordMinLength}
                onChange={(event) => updateField("passwordMinLength", event.target.value)}
                error={errors.passwordMinLength}
              />
            </SettingsField>

            <div className="flex flex-col gap-1">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {t("admin.settings.passwordCompositionTitle")}
              </p>
              <Checkbox
                checked={draft.passwordRequireUppercase}
                onChange={(event) => updateField("passwordRequireUppercase", event.target.checked)}
                label={t("admin.settings.passwordRequireUppercase")}
              />
              <Checkbox
                checked={draft.passwordRequireLowercase}
                onChange={(event) => updateField("passwordRequireLowercase", event.target.checked)}
                label={t("admin.settings.passwordRequireLowercase")}
              />
              <Checkbox
                checked={draft.passwordRequireNumber}
                onChange={(event) => updateField("passwordRequireNumber", event.target.checked)}
                label={t("admin.settings.passwordRequireNumber")}
              />
              <Checkbox
                checked={draft.passwordRequireSymbol}
                onChange={(event) => updateField("passwordRequireSymbol", event.target.checked)}
                label={t("admin.settings.passwordRequireSymbol")}
              />
              <SettingsHint>{t("admin.settings.passwordCompositionDesc")}</SettingsHint>
            </div>

            <SettingsField label={t("admin.settings.passwordExpirationDays")}>
              <Input
                type="number"
                min={LOCAL_AUTH_RANGES.passwordExpirationDays.min}
                max={LOCAL_AUTH_RANGES.passwordExpirationDays.max}
                value={draft.passwordExpirationDays}
                onChange={(event) => updateField("passwordExpirationDays", event.target.value)}
                error={errors.passwordExpirationDays}
              />
            </SettingsField>

            <SettingsField label={t("admin.settings.passwordHistoryCount")}>
              <Input
                type="number"
                min={LOCAL_AUTH_RANGES.passwordHistoryCount.min}
                max={LOCAL_AUTH_RANGES.passwordHistoryCount.max}
                value={draft.passwordHistoryCount}
                onChange={(event) => updateField("passwordHistoryCount", event.target.value)}
                error={errors.passwordHistoryCount}
              />
            </SettingsField>

            <WarningList warnings={passwordNotes} testId="password-warnings" />
          </SettingsGroup>

          <SettingsGroup title={t("admin.settings.lockoutTitle")}>
            <SettingsField label={t("admin.settings.maxFailedLoginAttempts")}>
              <Input
                type="number"
                min={LOCAL_AUTH_RANGES.maxFailedLoginAttempts.min}
                max={LOCAL_AUTH_RANGES.maxFailedLoginAttempts.max}
                value={draft.maxFailedLoginAttempts}
                onChange={(event) => updateField("maxFailedLoginAttempts", event.target.value)}
                error={errors.maxFailedLoginAttempts}
              />
            </SettingsField>
            <SettingsField label={t("admin.settings.lockoutDurationMinutes")}>
              <Input
                type="number"
                min={LOCAL_AUTH_RANGES.lockoutDurationMinutes.min}
                max={LOCAL_AUTH_RANGES.lockoutDurationMinutes.max}
                disabled={draft.maxFailedLoginAttempts.trim() === ""}
                value={draft.lockoutDurationMinutes}
                onChange={(event) => updateField("lockoutDurationMinutes", event.target.value)}
                error={errors.lockoutDurationMinutes}
              />
            </SettingsField>
            <SettingsHint>{t("admin.settings.lockoutDesc")}</SettingsHint>
          </SettingsGroup>
        </>
      )}
    </>
  );
}
