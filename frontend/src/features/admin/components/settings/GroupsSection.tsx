"use client";

import type { GroupPermissionLevel } from "@/features/admin/types/admin-settings.types";
import {
  CREATE_GROUPS_OPTIONS,
  DELETE_GROUP_OPTIONS,
  GROUP_PERMISSION_LABELS,
  MEMBER_ACTION_OPTIONS,
} from "@/features/admin/constants/group-permission-options.constant";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useTranslation } from "@/i18n";
import { SettingsGroup } from "./SettingsPrimitives";
import type { SettingsSectionProps } from "./settings-section.types";

interface GroupPermissionFieldProps {
  label: string;
  value: GroupPermissionLevel;
  options: GroupPermissionLevel[];
  onChange: (value: GroupPermissionLevel) => void;
  overrideAllowed?: boolean;
  onOverrideChange?: (value: boolean) => void;
  disabled?: boolean;
  optionLabels?: Record<GroupPermissionLevel, string>;
  overrideLabel?: string;
}

function GroupPermissionField({
  label,
  value,
  options,
  onChange,
  overrideAllowed,
  onOverrideChange,
  disabled,
  optionLabels = GROUP_PERMISSION_LABELS,
  overrideLabel = "El grupo puede cambiar esto",
}: GroupPermissionFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
      {label}
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value as GroupPermissionLevel)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels[option] ?? GROUP_PERMISSION_LABELS[option]}
          </option>
        ))}
      </Select>
      {onOverrideChange && (
        <Checkbox
          className="mt-1"
          checked={overrideAllowed ?? false}
          onChange={(event) => onOverrideChange(event.target.checked)}
          disabled={disabled}
          label={overrideLabel}
        />
      )}
    </label>
  );
}

export function GroupsSection({ draft, errors, updateField }: SettingsSectionProps) {
  const { t } = useTranslation();

  const groupPermissionLabels: Record<GroupPermissionLevel, string> = {
    ALL_MEMBERS: t("admin.settings.permAllMembers"),
    GROUP_ADMINS_ONLY: t("admin.settings.permGroupAdminsOnly"),
    APP_ADMINS_ONLY: t("admin.settings.permAppAdminsOnly"),
    CREATOR_ONLY: t("admin.settings.permCreatorOnly"),
  };
  const overrideLabel = t("admin.settings.groupOverrideCheckbox");

  return (
    <>
      <SettingsGroup title={t("admin.settings.groupsCreationTitle")}>
        <GroupPermissionField
          label={t("admin.settings.whoCanCreateGroups")}
          value={draft.whoCanCreateGroups}
          options={CREATE_GROUPS_OPTIONS}
          onChange={(value) => updateField("whoCanCreateGroups", value)}
          optionLabels={groupPermissionLabels}
        />
        <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
          {t("admin.settings.maxGroupMembers")}
          <Input
            type="number"
            min={2}
            value={draft.maxGroupMembers}
            onChange={(event) => updateField("maxGroupMembers", event.target.value)}
            error={errors.maxGroupMembers}
          />
          <Checkbox
            className="mt-1"
            checked={draft.allowGroupOverrideMaxGroupMembers}
            onChange={(event) => updateField("allowGroupOverrideMaxGroupMembers", event.target.checked)}
            label={overrideLabel}
          />
        </label>
      </SettingsGroup>

      <SettingsGroup title={t("admin.settings.groupsMembersTitle")}>
        <GroupPermissionField
          label={t("admin.settings.whoCanAddMembers")}
          value={draft.whoCanAddMembers}
          options={MEMBER_ACTION_OPTIONS}
          onChange={(value) => updateField("whoCanAddMembers", value)}
          overrideAllowed={draft.allowGroupOverrideAddMembers}
          onOverrideChange={(value) => updateField("allowGroupOverrideAddMembers", value)}
          optionLabels={groupPermissionLabels}
          overrideLabel={overrideLabel}
        />
        <GroupPermissionField
          label={t("admin.settings.whoCanRemoveMembers")}
          value={draft.whoCanRemoveMembers}
          options={MEMBER_ACTION_OPTIONS}
          onChange={(value) => updateField("whoCanRemoveMembers", value)}
          overrideAllowed={draft.allowGroupOverrideRemoveMembers}
          onOverrideChange={(value) => updateField("allowGroupOverrideRemoveMembers", value)}
          optionLabels={groupPermissionLabels}
          overrideLabel={overrideLabel}
        />
        <GroupPermissionField
          label={t("admin.settings.whoCanChangeGroupInfo")}
          value={draft.whoCanChangeGroupInfo}
          options={MEMBER_ACTION_OPTIONS}
          onChange={(value) => updateField("whoCanChangeGroupInfo", value)}
          overrideAllowed={draft.allowGroupOverrideChangeGroupInfo}
          onOverrideChange={(value) => updateField("allowGroupOverrideChangeGroupInfo", value)}
          optionLabels={groupPermissionLabels}
          overrideLabel={overrideLabel}
        />
        <GroupPermissionField
          label={t("admin.settings.whoCanLeaveGroup")}
          value={draft.whoCanLeaveGroup}
          options={MEMBER_ACTION_OPTIONS}
          onChange={(value) => updateField("whoCanLeaveGroup", value)}
          overrideAllowed={draft.allowGroupOverrideLeaveGroup}
          onOverrideChange={(value) => updateField("allowGroupOverrideLeaveGroup", value)}
          optionLabels={groupPermissionLabels}
          overrideLabel={overrideLabel}
        />
      </SettingsGroup>

      <SettingsGroup title={t("admin.settings.groupsDeletionTitle")}>
        <Checkbox
          checked={draft.allowGroupDelete}
          onChange={(event) => updateField("allowGroupDelete", event.target.checked)}
          label={t("admin.settings.allowGroupDelete")}
        />
        <GroupPermissionField
          label={t("admin.settings.whoCanDeleteGroup")}
          value={draft.whoCanDeleteGroup}
          options={DELETE_GROUP_OPTIONS}
          onChange={(value) => updateField("whoCanDeleteGroup", value)}
          overrideAllowed={draft.allowGroupOverrideDeleteGroup}
          onOverrideChange={(value) => updateField("allowGroupOverrideDeleteGroup", value)}
          disabled={!draft.allowGroupDelete}
          optionLabels={groupPermissionLabels}
          overrideLabel={overrideLabel}
        />
      </SettingsGroup>
    </>
  );
}
