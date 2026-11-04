import { FILE_TYPE_CATEGORIES } from "@/features/admin/constants/file-type-categories.constant";
import type { FileTypeSelectionItem } from "@/features/admin/components/FileTypeMultiSelect";
import type {
  AdminSettings,
  FileTypeRestrictionMode,
  GroupPermissionLevel,
  UpdateAdminSettingsPayload,
} from "@/features/admin/types/admin-settings.types";

export interface DraftState {
  maxUploadSizeMb: string;
  fileTypeRestrictionMode: FileTypeRestrictionMode;
  /** Categorías curadas + valores manuales — se expanden a mime patterns recién en `toPayload`. */
  fileTypeSelection: FileTypeSelectionItem[];
  /** Vacío = sin límite (`null`). */
  maxFilesPerMessage: string;
  allowConversationDelete: boolean;
  maxVoiceNoteDurationSeconds: string;
  maxGroupMembers: string;
  whoCanCreateGroups: GroupPermissionLevel;
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  whoCanChangeGroupInfo: GroupPermissionLevel;
  whoCanDeleteGroup: GroupPermissionLevel;
  allowGroupDelete: boolean;
  whoCanLeaveGroup: GroupPermissionLevel;
  allowGroupOverrideAddMembers: boolean;
  allowGroupOverrideRemoveMembers: boolean;
  allowGroupOverrideMaxGroupMembers: boolean;
  allowGroupOverrideChangeGroupInfo: boolean;
  allowGroupOverrideDeleteGroup: boolean;
  allowGroupOverrideLeaveGroup: boolean;
  messageRetentionDays: string;
  auditLogRetentionDays: string;
  allowMessageEdit: boolean;
  messageEditTimeLimitMinutes: string;
  allowMessageDeleteForEveryone: boolean;
  messageDeleteForEveryoneTimeLimitMinutes: string;
  allowStickersAndGifs: boolean;
  uploadCleanupEnabled: boolean;
  orphanFileRetentionHours: string;
  softDeletedFilePurgeDays: string;
  uploadCleanupDryRun: boolean;
  fileMigrationEnabled: boolean;
  fileMigrationBatchSize: string;
  fileMigrationIntervalMinutes: string;
  fileMigrationDeleteLocalAfterCommit: boolean;
  localSessionTtlHours: string;
  passwordMinLength: string;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  /** Vacío = no vencen (`null`). */
  passwordExpirationDays: string;
  passwordHistoryCount: string;
  /** Vacío = sin bloqueo (`null`). */
  maxFailedLoginAttempts: string;
  lockoutDurationMinutes: string;
}

/** Rangos de D15 (docs/design/LOCAL_AUTH_PLAN.md), los mismos que valida
 * `backend/src/modules/settings/settings.validator.ts`. */
export const LOCAL_AUTH_RANGES = {
  localSessionTtlHours: { min: 1, max: 720 },
  passwordMinLength: { min: 8, max: 128 },
  passwordExpirationDays: { min: 1, max: 365 },
  passwordHistoryCount: { min: 0, max: 12 },
  maxFailedLoginAttempts: { min: 3, max: 50 },
  lockoutDurationMinutes: { min: 1, max: 1440 },
} as const;

/** Una categoría cuenta como "marcada" si TODOS sus patterns están en la lista guardada —
 * evita mostrarla a medias marcada por una coincidencia parcial. Cualquier pattern guardado
 * que no forme una categoría completa (ej. un valor manual, o el remanente de una categoría
 * que perdió un pattern) sobrevive como un chip "custom" en vez de perderse. */
function selectionFromPatterns(patterns: string[]): FileTypeSelectionItem[] {
  const remaining = new Set(patterns);
  const items: FileTypeSelectionItem[] = [];
  for (const category of FILE_TYPE_CATEGORIES) {
    if (category.patterns.every((pattern) => remaining.has(pattern))) {
      items.push({ type: "category", id: category.id });
      category.patterns.forEach((pattern) => remaining.delete(pattern));
    }
  }
  // Cada remanente queda como su propio chip de un pattern — no hay forma de recuperar qué
  // extensión tipeó el admin originalmente (el backend solo guarda el mime type resuelto), así
  // que el label del chip es el mime type mismo.
  for (const pattern of remaining) {
    items.push({ type: "custom", label: pattern, patterns: [pattern] });
  }
  return items;
}

function patternsFromSelection(items: FileTypeSelectionItem[]): string[] {
  const patterns = new Set<string>();
  for (const item of items) {
    if (item.type === "category") {
      const category = FILE_TYPE_CATEGORIES.find((candidate) => candidate.id === item.id);
      category?.patterns.forEach((pattern) => patterns.add(pattern));
    } else {
      item.patterns.forEach((pattern) => patterns.add(pattern));
    }
  }
  return Array.from(patterns);
}

export function toDraft(settings: AdminSettings): DraftState {
  return {
    maxUploadSizeMb: String(settings.maxUploadSizeMb),
    fileTypeRestrictionMode: settings.fileTypeRestrictionMode,
    fileTypeSelection: selectionFromPatterns(settings.fileTypeList),
    maxFilesPerMessage: settings.maxFilesPerMessage == null ? "" : String(settings.maxFilesPerMessage),
    allowConversationDelete: settings.allowConversationDelete,
    maxVoiceNoteDurationSeconds: String(settings.maxVoiceNoteDurationSeconds),
    maxGroupMembers: String(settings.maxGroupMembers),
    whoCanCreateGroups: settings.whoCanCreateGroups,
    whoCanAddMembers: settings.whoCanAddMembers,
    whoCanRemoveMembers: settings.whoCanRemoveMembers,
    whoCanChangeGroupInfo: settings.whoCanChangeGroupInfo,
    whoCanDeleteGroup: settings.whoCanDeleteGroup,
    allowGroupDelete: settings.allowGroupDelete,
    whoCanLeaveGroup: settings.whoCanLeaveGroup,
    allowGroupOverrideAddMembers: settings.allowGroupOverrideAddMembers,
    allowGroupOverrideRemoveMembers: settings.allowGroupOverrideRemoveMembers,
    allowGroupOverrideMaxGroupMembers: settings.allowGroupOverrideMaxGroupMembers,
    allowGroupOverrideChangeGroupInfo: settings.allowGroupOverrideChangeGroupInfo,
    allowGroupOverrideDeleteGroup: settings.allowGroupOverrideDeleteGroup,
    allowGroupOverrideLeaveGroup: settings.allowGroupOverrideLeaveGroup,
    messageRetentionDays: settings.messageRetentionDays == null ? "" : String(settings.messageRetentionDays),
    auditLogRetentionDays: settings.auditLogRetentionDays == null ? "" : String(settings.auditLogRetentionDays),
    allowMessageEdit: settings.allowMessageEdit,
    messageEditTimeLimitMinutes:
      settings.messageEditTimeLimitMinutes == null ? "" : String(settings.messageEditTimeLimitMinutes),
    allowMessageDeleteForEveryone: settings.allowMessageDeleteForEveryone,
    messageDeleteForEveryoneTimeLimitMinutes:
      settings.messageDeleteForEveryoneTimeLimitMinutes == null
        ? ""
        : String(settings.messageDeleteForEveryoneTimeLimitMinutes),
    allowStickersAndGifs: settings.allowStickersAndGifs,
    uploadCleanupEnabled: settings.uploadCleanupEnabled ?? false,
    orphanFileRetentionHours:
      settings.orphanFileRetentionHours == null ? "" : String(settings.orphanFileRetentionHours),
    softDeletedFilePurgeDays:
      settings.softDeletedFilePurgeDays == null ? "" : String(settings.softDeletedFilePurgeDays),
    uploadCleanupDryRun: settings.uploadCleanupDryRun ?? false,
    fileMigrationEnabled: settings.fileMigrationEnabled ?? false,
    fileMigrationBatchSize: String(settings.fileMigrationBatchSize ?? 50),
    fileMigrationIntervalMinutes: String(settings.fileMigrationIntervalMinutes ?? 60),
    fileMigrationDeleteLocalAfterCommit: settings.fileMigrationDeleteLocalAfterCommit ?? false,
    // Los `??` cubren un backend anterior a LOCAL_AUTH_PLAN.md, con sus defaults.
    localSessionTtlHours: String(settings.localSessionTtlHours ?? 12),
    passwordMinLength: String(settings.passwordMinLength ?? 12),
    passwordRequireUppercase: settings.passwordRequireUppercase ?? false,
    passwordRequireLowercase: settings.passwordRequireLowercase ?? false,
    passwordRequireNumber: settings.passwordRequireNumber ?? false,
    passwordRequireSymbol: settings.passwordRequireSymbol ?? false,
    passwordExpirationDays: settings.passwordExpirationDays == null ? "" : String(settings.passwordExpirationDays),
    passwordHistoryCount: String(settings.passwordHistoryCount ?? 0),
    maxFailedLoginAttempts: settings.maxFailedLoginAttempts == null ? "" : String(settings.maxFailedLoginAttempts),
    lockoutDurationMinutes: String(settings.lockoutDurationMinutes ?? 15),
  };
}

export type FieldErrors = Partial<Record<keyof DraftState, string>>;

export type Translate = (key: string, params?: Record<string, string | number>) => string;

function isIntegerInRange(value: string, range: { min: number; max: number }): boolean {
  const number = Number(value);
  return value.trim() !== "" && Number.isInteger(number) && number >= range.min && number <= range.max;
}

/** La duración de la sesión es de LINK: rige con cualquier proveedor de autenticación. */
function validateSession(draft: DraftState, tr: Translate, errors: FieldErrors) {
  if (!isIntegerInRange(draft.localSessionTtlHours, LOCAL_AUTH_RANGES.localSessionTtlHours)) {
    errors.localSessionTtlHours = tr("admin.settings.rangeError", LOCAL_AUTH_RANGES.localSessionTtlHours);
  }
}

/** Campos de "Contraseñas": solo se validan (y se envían) cuando las contraseñas se
 * administran en LINK (cuentas locales). */
function validatePasswordPolicy(draft: DraftState, tr: Translate, errors: FieldErrors) {
  const lockoutEnabled = draft.maxFailedLoginAttempts.trim() !== "";
  const required = [
    "passwordMinLength",
    "passwordHistoryCount",
    // Sin bloqueo, la duración no aplica: el campo queda deshabilitado y no se envía.
    ...(lockoutEnabled ? (["lockoutDurationMinutes"] as const) : []),
  ] as const;
  for (const field of required) {
    if (!isIntegerInRange(draft[field], LOCAL_AUTH_RANGES[field])) {
      errors[field] = tr("admin.settings.rangeError", LOCAL_AUTH_RANGES[field]);
    }
  }
  const optional = ["passwordExpirationDays", "maxFailedLoginAttempts"] as const;
  for (const field of optional) {
    if (draft[field].trim() !== "" && !isIntegerInRange(draft[field], LOCAL_AUTH_RANGES[field])) {
      errors[field] = tr("admin.settings.optionalRangeError", LOCAL_AUTH_RANGES[field]);
    }
  }
}

export function validate(draft: DraftState, t?: Translate, passwordPolicy = false): FieldErrors {
  const errors: FieldErrors = {};
  const tr = (k: string, defaultVal: string) => (t ? t(k) : defaultVal);

  if (t) {
    validateSession(draft, t, errors);
    if (passwordPolicy) validatePasswordPolicy(draft, t, errors);
  }

  const uploadSize = Number(draft.maxUploadSizeMb);
  if (!Number.isInteger(uploadSize) || uploadSize < 1) {
    errors.maxUploadSizeMb = tr("admin.settings.positiveIntegerError", "Debe ser un número entero mayor a 0.");
  }

  const voiceDuration = Number(draft.maxVoiceNoteDurationSeconds);
  if (!Number.isInteger(voiceDuration) || voiceDuration < 1) {
    errors.maxVoiceNoteDurationSeconds = tr("admin.settings.positiveIntegerError", "Debe ser un número entero mayor a 0.");
  }

  const groupMax = Number(draft.maxGroupMembers);
  if (!Number.isInteger(groupMax) || groupMax < 2) {
    errors.maxGroupMembers = tr("admin.settings.greaterThanOneIntegerError", "Debe ser un número entero mayor a 1.");
  }

  if (draft.maxFilesPerMessage.trim() !== "") {
    const filesLimit = Number(draft.maxFilesPerMessage);
    if (!Number.isInteger(filesLimit) || filesLimit < 1) {
      errors.maxFilesPerMessage = tr("admin.settings.filesPerMessageError", "Debe ser un número entero mayor a 0, o vacío para sin límite.");
    }
  }

  if (draft.messageRetentionDays.trim() !== "") {
    const retention = Number(draft.messageRetentionDays);
    if (!Number.isInteger(retention) || retention < 0) {
      errors.messageRetentionDays = tr("admin.settings.messageRetentionError", "Debe ser un número entero mayor o igual a 0, o vacío para deshabilitar.");
    }
  }

  if (draft.auditLogRetentionDays.trim() !== "") {
    const retention = Number(draft.auditLogRetentionDays);
    if (!Number.isInteger(retention) || retention < 1) {
      errors.auditLogRetentionDays = tr("admin.settings.auditRetentionError", "Debe ser un número entero mayor a 0, o vacío para conservar para siempre.");
    }
  }

  if (draft.messageEditTimeLimitMinutes.trim() !== "") {
    const limit = Number(draft.messageEditTimeLimitMinutes);
    if (!Number.isInteger(limit) || limit < 1) {
      errors.messageEditTimeLimitMinutes = tr("admin.settings.filesPerMessageError", "Debe ser un número entero mayor a 0, o vacío para sin límite.");
    }
  }

  if (draft.messageDeleteForEveryoneTimeLimitMinutes.trim() !== "") {
    const limit = Number(draft.messageDeleteForEveryoneTimeLimitMinutes);
    if (!Number.isInteger(limit) || limit < 1) {
      errors.messageDeleteForEveryoneTimeLimitMinutes = tr("admin.settings.filesPerMessageError", "Debe ser un número entero mayor a 0, o vacío para sin límite.");
    }
  }

  if (draft.orphanFileRetentionHours.trim() !== "") {
    const hours = Number(draft.orphanFileRetentionHours);
    if (!Number.isInteger(hours) || hours < 1) {
      errors.orphanFileRetentionHours = tr("admin.settings.orphanRetentionError", "Debe ser un número entero mayor a 0, o vacío para deshabilitar.");
    }
  }

  if (draft.softDeletedFilePurgeDays.trim() !== "") {
    const days = Number(draft.softDeletedFilePurgeDays);
    if (!Number.isInteger(days) || days < 1) {
      errors.softDeletedFilePurgeDays = tr("admin.settings.purgeRetentionError", "Debe ser un número entero mayor a 0, o vacío para deshabilitar.");
    }
  }

  const batchSize = Number(draft.fileMigrationBatchSize);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    errors.fileMigrationBatchSize = tr("admin.settings.migrationBatchError", "Debe ser un número entero entre 1 y 500.");
  }

  const intervalMinutes = Number(draft.fileMigrationIntervalMinutes);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    errors.fileMigrationIntervalMinutes = tr("admin.settings.migrationIntervalError", "Debe ser un número entero mayor a 0.");
  }

  return errors;
}

/** Con un proveedor externo la sección no se muestra y sus campos no se envían (el backend
 * los rechazaría): las contraseñas las administra el proveedor. */
function toPasswordPolicyPayload(draft: DraftState): UpdateAdminSettingsPayload {
  return {
    passwordMinLength: Number(draft.passwordMinLength),
    passwordRequireUppercase: draft.passwordRequireUppercase,
    passwordRequireLowercase: draft.passwordRequireLowercase,
    passwordRequireNumber: draft.passwordRequireNumber,
    passwordRequireSymbol: draft.passwordRequireSymbol,
    passwordExpirationDays: draft.passwordExpirationDays.trim() === "" ? null : Number(draft.passwordExpirationDays),
    passwordHistoryCount: Number(draft.passwordHistoryCount),
    ...(draft.maxFailedLoginAttempts.trim() === ""
      ? { maxFailedLoginAttempts: null }
      : {
          maxFailedLoginAttempts: Number(draft.maxFailedLoginAttempts),
          lockoutDurationMinutes: Number(draft.lockoutDurationMinutes),
        }),
  };
}

export type SessionWarning = "ttlLoweredWarning" | "ttlRaisedWarning";
export type PasswordWarning = "policyHardenedWarning" | "expirationWarning";

/** Efectos de D16 que el admin tiene que ver antes de guardar: bajar la
 * duración corta sesiones abiertas; subirla no alarga ninguna (cada token
 * conserva el vencimiento con el que se emitió, así que hay que volver a
 * iniciar sesión); endurecer la política o el vencimiento no corta nada, pero
 * pide cambiar la contraseña en el próximo login. */
export function sessionWarnings(draft: DraftState, saved: DraftState): SessionWarning[] {
  if (draft.localSessionTtlHours.trim() === "") return [];
  const ttl = Number(draft.localSessionTtlHours);
  const savedTtl = Number(saved.localSessionTtlHours);
  if (ttl < savedTtl) return ["ttlLoweredWarning"];
  if (ttl > savedTtl) return ["ttlRaisedWarning"];
  return [];
}

export function passwordWarnings(draft: DraftState, saved: DraftState): PasswordWarning[] {
  const warnings: PasswordWarning[] = [];
  const rules = ["passwordRequireUppercase", "passwordRequireLowercase", "passwordRequireNumber", "passwordRequireSymbol"] as const;
  if (
    Number(draft.passwordMinLength) > Number(saved.passwordMinLength) ||
    rules.some((rule) => draft[rule] && !saved[rule])
  ) {
    warnings.push("policyHardenedWarning");
  }
  if (
    draft.passwordExpirationDays.trim() !== "" &&
    (saved.passwordExpirationDays === "" || Number(draft.passwordExpirationDays) < Number(saved.passwordExpirationDays))
  ) {
    warnings.push("expirationWarning");
  }
  return warnings;
}

export function toPayload(draft: DraftState, passwordPolicy: boolean): UpdateAdminSettingsPayload {
  return {
    localSessionTtlHours: Number(draft.localSessionTtlHours),
    ...(passwordPolicy ? toPasswordPolicyPayload(draft) : {}),
    maxUploadSizeMb: Number(draft.maxUploadSizeMb),
    fileTypeRestrictionMode: draft.fileTypeRestrictionMode,
    fileTypeList: patternsFromSelection(draft.fileTypeSelection),
    maxFilesPerMessage: draft.maxFilesPerMessage.trim() === "" ? null : Number(draft.maxFilesPerMessage),
    allowConversationDelete: draft.allowConversationDelete,
    maxVoiceNoteDurationSeconds: Number(draft.maxVoiceNoteDurationSeconds),
    maxGroupMembers: Number(draft.maxGroupMembers),
    whoCanCreateGroups: draft.whoCanCreateGroups,
    whoCanAddMembers: draft.whoCanAddMembers,
    whoCanRemoveMembers: draft.whoCanRemoveMembers,
    whoCanChangeGroupInfo: draft.whoCanChangeGroupInfo,
    whoCanDeleteGroup: draft.whoCanDeleteGroup,
    allowGroupDelete: draft.allowGroupDelete,
    whoCanLeaveGroup: draft.whoCanLeaveGroup,
    allowGroupOverrideAddMembers: draft.allowGroupOverrideAddMembers,
    allowGroupOverrideRemoveMembers: draft.allowGroupOverrideRemoveMembers,
    allowGroupOverrideMaxGroupMembers: draft.allowGroupOverrideMaxGroupMembers,
    allowGroupOverrideChangeGroupInfo: draft.allowGroupOverrideChangeGroupInfo,
    allowGroupOverrideDeleteGroup: draft.allowGroupOverrideDeleteGroup,
    allowGroupOverrideLeaveGroup: draft.allowGroupOverrideLeaveGroup,
    messageRetentionDays: draft.messageRetentionDays.trim() === "" ? null : Number(draft.messageRetentionDays),
    auditLogRetentionDays: draft.auditLogRetentionDays.trim() === "" ? null : Number(draft.auditLogRetentionDays),
    allowMessageEdit: draft.allowMessageEdit,
    messageEditTimeLimitMinutes:
      draft.messageEditTimeLimitMinutes.trim() === "" ? null : Number(draft.messageEditTimeLimitMinutes),
    allowMessageDeleteForEveryone: draft.allowMessageDeleteForEveryone,
    messageDeleteForEveryoneTimeLimitMinutes:
      draft.messageDeleteForEveryoneTimeLimitMinutes.trim() === ""
        ? null
        : Number(draft.messageDeleteForEveryoneTimeLimitMinutes),
    allowStickersAndGifs: draft.allowStickersAndGifs,
    uploadCleanupEnabled: draft.uploadCleanupEnabled,
    orphanFileRetentionHours:
      draft.orphanFileRetentionHours.trim() === "" ? null : Number(draft.orphanFileRetentionHours),
    softDeletedFilePurgeDays:
      draft.softDeletedFilePurgeDays.trim() === "" ? null : Number(draft.softDeletedFilePurgeDays),
    uploadCleanupDryRun: draft.uploadCleanupDryRun,
    fileMigrationEnabled: draft.fileMigrationEnabled,
    fileMigrationBatchSize: Number(draft.fileMigrationBatchSize),
    fileMigrationIntervalMinutes: Number(draft.fileMigrationIntervalMinutes),
    fileMigrationDeleteLocalAfterCommit: draft.fileMigrationDeleteLocalAfterCommit,
  };
}
