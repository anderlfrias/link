import { describe, expect, it } from "vitest";
import type { AdminSettings } from "@/features/admin/types/admin-settings.types";
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  normalizeOrganizationName,
  toDraft,
  toPayload,
  validate,
} from "./admin-settings-draft";

// Solo importan los campos de la app móvil: el resto toma lo que dé `toDraft` con valores mínimos.
const base = { fileTypeList: [], fileTypeRestrictionMode: "DISABLED" } as unknown as AdminSettings;
const draftWith = (overrides: Partial<AdminSettings>) => toDraft({ ...base, ...overrides });

describe("nombre de la organización", () => {
  it("se recorta y colapsa los espacios y los saltos de línea", () => {
    expect(normalizeOrganizationName("  Clínica \n  del\tSol  ")).toBe("Clínica del Sol");
    expect(normalizeOrganizationName("   ")).toBe("");
  });

  it("el borrador toma el nombre guardado, o vacío si no hay", () => {
    expect(draftWith({ organizationName: "ACME" }).organizationName).toBe("ACME");
    expect(draftWith({ organizationName: null }).organizationName).toBe("");
    // Un backend anterior a la app móvil no manda el campo.
    expect(draftWith({}).organizationName).toBe("");
  });

  it("el payload manda el nombre normalizado, o null si quedó vacío", () => {
    expect(toPayload(draftWith({ organizationName: "x" }), false).organizationName).toBe("x");
    const draft = { ...draftWith({}), organizationName: "  Clínica   del Sol " };
    expect(toPayload(draft, false).organizationName).toBe("Clínica del Sol");
    expect(toPayload({ ...draft, organizationName: "   " }, false).organizationName).toBeNull();
  });

  it("valida el largo máximo y los caracteres de control", () => {
    const ok = { ...draftWith({}), organizationName: "a".repeat(ORGANIZATION_NAME_MAX_LENGTH) };
    expect(validate(ok).organizationName).toBeUndefined();
    expect(validate({ ...ok, organizationName: "a".repeat(ORGANIZATION_NAME_MAX_LENGTH + 1) }).organizationName).toBeDefined();
    expect(validate({ ...ok, organizationName: "hola\u0000mundo" }).organizationName).toBeDefined();
    expect(validate({ ...ok, organizationName: "hola‮mundo" }).organizationName).toBeDefined();
    // Un salto de línea se normaliza a un espacio, no es un error.
    expect(validate({ ...ok, organizationName: "hola\nmundo" }).organizationName).toBeUndefined();
  });
});

describe("uso de la app móvil", () => {
  it("por defecto está apagado, y el payload lo respeta", () => {
    expect(draftWith({}).allowMobileApp).toBe(false);
    expect(toPayload(draftWith({ allowMobileApp: true }), false).allowMobileApp).toBe(true);
    expect(toPayload(draftWith({}), false).allowMobileApp).toBe(false);
  });
});
