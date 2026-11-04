import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: ReactNode;
  testId?: string;
}

/// Tarjeta que agrupa campos relacionados dentro de una sección — el equivalente a los bloques
/// de filas redondeados de los ajustes de WhatsApp/Telegram.
export function SettingsGroup({ title, description, children, testId }: SettingsGroupProps) {
  return (
    <section
      data-testid={testId}
      className="rounded-xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
    >
      {title && <h4 className="text-sm font-medium text-brand-ink dark:text-white">{title}</h4>}
      {description && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>}
      <div className={cn("flex flex-col gap-4", title || description ? "mt-3" : null)}>{children}</div>
    </section>
  );
}

/// Texto de ayuda bajo un campo.
export function SettingsHint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-neutral-500 dark:text-neutral-400", className)}>{children}</p>;
}

/// Contenedor de un campo con etiqueta — `<label>` para que el input quede asociado a su texto.
export function SettingsField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
      {label}
      {children}
    </label>
  );
}

/// Campos que solo aplican con una opción activa (limpieza, migración): sangría con borde a la izquierda.
export function SettingsNested({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 border-l-2 border-brand-accent/30 pl-4">{children}</div>;
}
