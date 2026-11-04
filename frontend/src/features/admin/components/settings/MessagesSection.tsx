"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/i18n";
import { SettingsField, SettingsGroup, SettingsHint } from "./SettingsPrimitives";
import type { SettingsSectionProps } from "./settings-section.types";

export function MessagesSection({ draft, errors, updateField }: SettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <>
      <SettingsGroup title={t("admin.settings.editAndDeleteTitle")}>
        <div className="flex flex-col gap-3">
          <Checkbox
            checked={draft.allowMessageEdit}
            onChange={(event) => updateField("allowMessageEdit", event.target.checked)}
            label={t("admin.settings.allowMessageEdit")}
          />
          <SettingsField label={t("admin.settings.messageEditTimeLimitMinutes")}>
            <Input
              type="number"
              min={1}
              disabled={!draft.allowMessageEdit}
              value={draft.messageEditTimeLimitMinutes}
              onChange={(event) => updateField("messageEditTimeLimitMinutes", event.target.value)}
              error={errors.messageEditTimeLimitMinutes}
            />
          </SettingsField>
        </div>
        <div className="flex flex-col gap-3">
          <Checkbox
            checked={draft.allowMessageDeleteForEveryone}
            onChange={(event) => updateField("allowMessageDeleteForEveryone", event.target.checked)}
            label={t("admin.settings.allowMessageDeleteForEveryone")}
          />
          <SettingsField label={t("admin.settings.messageDeleteForEveryoneTimeLimitMinutes")}>
            <Input
              type="number"
              min={1}
              disabled={!draft.allowMessageDeleteForEveryone}
              value={draft.messageDeleteForEveryoneTimeLimitMinutes}
              onChange={(event) => updateField("messageDeleteForEveryoneTimeLimitMinutes", event.target.value)}
              error={errors.messageDeleteForEveryoneTimeLimitMinutes}
            />
          </SettingsField>
        </div>
        <SettingsHint>{t("admin.settings.moderatorDeleteNotice")}</SettingsHint>
      </SettingsGroup>

      <SettingsGroup title={t("admin.settings.stickersTitle")}>
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={draft.allowStickersAndGifs}
            onChange={(event) => updateField("allowStickersAndGifs", event.target.checked)}
            label={t("admin.settings.allowStickersAndGifs")}
          />
          <SettingsHint>{t("admin.settings.stickersDesc")}</SettingsHint>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("admin.settings.voiceNotesTitle")}>
        <SettingsField label={t("admin.settings.maxVoiceNoteDurationSeconds")}>
          <Input
            type="number"
            min={1}
            value={draft.maxVoiceNoteDurationSeconds}
            onChange={(event) => updateField("maxVoiceNoteDurationSeconds", event.target.value)}
            error={errors.maxVoiceNoteDurationSeconds}
          />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title={t("admin.settings.privateChatsTitle")}>
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={draft.allowConversationDelete}
            onChange={(event) => updateField("allowConversationDelete", event.target.checked)}
            label={t("admin.settings.allowConversationDelete")}
          />
          <SettingsHint>{t("admin.settings.allowConversationDeleteDesc")}</SettingsHint>
        </div>
      </SettingsGroup>
    </>
  );
}
