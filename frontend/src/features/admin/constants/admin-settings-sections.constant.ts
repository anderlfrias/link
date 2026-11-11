import {
  IconDatabase,
  IconFiles,
  IconHistory,
  IconLock,
  IconDeviceMobile,
  IconMessage,
  IconUsersGroup,
  type TablerIcon,
} from "@tabler/icons-react";
import type { DraftState } from "@/features/admin/utils/admin-settings-draft";

export type SettingsSectionId =
  | "messages"
  | "groups"
  | "attachments"
  | "retention"
  | "storage"
  | "security"
  | "mobileApp";
export type SettingsSectionGroupId = "communication" | "data" | "access";

export interface SettingsSection {
  id: SettingsSectionId;
  group: SettingsSectionGroupId;
  icon: TablerIcon;
  /** Clases de color del círculo del ícono en la lista (claro + oscuro). */
  tint: string;
  /** Sufijos de `admin.settings.<...>` — título y descripción corta que se ve en la lista. */
  titleKey: string;
  descriptionKey: string;
  /** Campos del borrador que edita la sección: de ahí salen el aviso de "con cambios" y el de "con errores"
   * en la lista, para que se vean aunque la sección no esté abierta. */
  fields: (keyof DraftState)[];
}

/// Agregar una sección nueva = un objeto más acá + su componente en `components/settings/` + una rama en el
/// `switch` de `AdminSettingsPanel`. Las secciones se ordenan por grupo en este mismo orden.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "messages",
    group: "communication",
    icon: IconMessage,
    tint: "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-blue-light",
    titleKey: "sectionMessages",
    descriptionKey: "sectionMessagesDesc",
    fields: [
      "allowMessageEdit",
      "messageEditTimeLimitMinutes",
      "allowMessageDeleteForEveryone",
      "messageDeleteForEveryoneTimeLimitMinutes",
      "allowStickersAndGifs",
      "maxVoiceNoteDurationSeconds",
      "allowConversationDelete",
    ],
  },
  {
    id: "groups",
    group: "communication",
    icon: IconUsersGroup,
    tint: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
    titleKey: "sectionGroups",
    descriptionKey: "sectionGroupsDesc",
    fields: [
      "maxGroupMembers",
      "whoCanCreateGroups",
      "whoCanAddMembers",
      "whoCanRemoveMembers",
      "whoCanChangeGroupInfo",
      "whoCanLeaveGroup",
      "allowGroupDelete",
      "whoCanDeleteGroup",
      "allowGroupOverrideAddMembers",
      "allowGroupOverrideRemoveMembers",
      "allowGroupOverrideMaxGroupMembers",
      "allowGroupOverrideChangeGroupInfo",
      "allowGroupOverrideDeleteGroup",
      "allowGroupOverrideLeaveGroup",
    ],
  },
  {
    id: "attachments",
    group: "communication",
    icon: IconFiles,
    tint: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    titleKey: "sectionAttachments",
    descriptionKey: "sectionAttachmentsDesc",
    fields: ["maxUploadSizeMb", "maxFilesPerMessage", "fileTypeRestrictionMode", "fileTypeSelection"],
  },
  {
    id: "retention",
    group: "data",
    icon: IconHistory,
    tint: "bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
    titleKey: "sectionRetention",
    descriptionKey: "sectionRetentionDesc",
    fields: ["messageRetentionDays", "auditLogRetentionDays"],
  },
  {
    id: "storage",
    group: "data",
    icon: IconDatabase,
    tint: "bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400",
    titleKey: "sectionStorage",
    descriptionKey: "sectionStorageDesc",
    fields: [
      "uploadCleanupEnabled",
      "orphanFileRetentionHours",
      "softDeletedFilePurgeDays",
      "uploadCleanupDryRun",
      "fileMigrationEnabled",
      "fileMigrationBatchSize",
      "fileMigrationIntervalMinutes",
      "fileMigrationDeleteLocalAfterCommit",
    ],
  },
  {
    id: "security",
    group: "access",
    icon: IconLock,
    tint: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
    titleKey: "sectionSecurity",
    descriptionKey: "sectionSecurityDesc",
    fields: [
      "localSessionTtlHours",
      "passwordMinLength",
      "passwordRequireUppercase",
      "passwordRequireLowercase",
      "passwordRequireNumber",
      "passwordRequireSymbol",
      "passwordExpirationDays",
      "passwordHistoryCount",
      "maxFailedLoginAttempts",
      "lockoutDurationMinutes",
    ],
  },
  {
    id: "mobileApp",
    group: "access",
    icon: IconDeviceMobile,
    tint: "bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400",
    titleKey: "sectionMobileApp",
    descriptionKey: "sectionMobileAppDesc",
    fields: ["allowMobileApp", "organizationName"],
  },
];

/** Orden de los grupos en la lista, con la clave `admin.settings.<labelKey>` de su encabezado. */
export const SETTINGS_SECTION_GROUPS: { id: SettingsSectionGroupId; labelKey: string }[] = [
  { id: "communication", labelKey: "groupCommunication" },
  { id: "data", labelKey: "groupData" },
  { id: "access", labelKey: "groupAccess" },
];
