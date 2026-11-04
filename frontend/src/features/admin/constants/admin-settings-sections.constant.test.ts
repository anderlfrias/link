import { describe, it, expect } from "vitest";
import { SETTINGS_SECTIONS, SETTINGS_SECTION_GROUPS } from "./admin-settings-sections.constant";
import { toDraft } from "@/features/admin/utils/admin-settings-draft";
import type { AdminSettings } from "@/features/admin/types/admin-settings.types";
import { es } from "@/i18n/locales/es";

describe("SETTINGS_SECTIONS", () => {
  it("asigna cada campo del borrador a exactamente una sección", () => {
    // Un campo sin sección no marcaría "cambios" ni "errores" en la lista; uno repetido los marcaría en dos.
    const draftFields = Object.keys(toDraft({ fileTypeList: [] } as unknown as AdminSettings));
    const assigned = SETTINGS_SECTIONS.flatMap((section) => section.fields);

    expect([...assigned].sort()).toEqual([...draftFields].sort());
  });

  it("usa ids únicos y solo grupos que existen", () => {
    const ids = SETTINGS_SECTIONS.map((section) => section.id);
    const groups = SETTINGS_SECTION_GROUPS.map((group) => group.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const section of SETTINGS_SECTIONS) expect(groups).toContain(section.group);
  });

  it("tiene texto para el título y la descripción de cada sección y el encabezado de cada grupo", () => {
    const settingsTexts = es.admin.settings as Record<string, string>;

    for (const section of SETTINGS_SECTIONS) {
      expect(settingsTexts[section.titleKey]).toBeTruthy();
      expect(settingsTexts[section.descriptionKey]).toBeTruthy();
    }
    for (const group of SETTINGS_SECTION_GROUPS) {
      expect(settingsTexts[group.labelKey]).toBeTruthy();
    }
  });

  it("no deja un grupo sin secciones", () => {
    for (const group of SETTINGS_SECTION_GROUPS) {
      expect(SETTINGS_SECTIONS.some((section) => section.group === group.id)).toBe(true);
    }
  });
});
