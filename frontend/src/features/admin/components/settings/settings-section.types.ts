import type { DraftState, FieldErrors } from "@/features/admin/utils/admin-settings-draft";

/** Props comunes de cada sección: el borrador vive en `AdminSettingsPanel` para que un solo
 * "Guardar cambios" cubra todas las secciones. */
export interface SettingsSectionProps {
  draft: DraftState;
  errors: FieldErrors;
  updateField: <K extends keyof DraftState>(field: K, value: DraftState[K]) => void;
}
