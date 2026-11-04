"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ADMIN_NAV_ITEMS } from "@/features/admin/constants/admin-nav.constant";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

interface AdminShellProps {
  children: React.ReactNode;
}

/// Layout visual del panel de administración, sin nada del sidebar de chats. El gate de rol vive en
/// el layout que envuelve a este componente (`(admin)/admin/layout.tsx`), no acá — este componente
/// asume que quien lo renderiza ya está autorizado.
///
/// El mismo `<nav>` se acomoda según el ancho, como en el resto de la app (corte en `lg`): sidebar
/// lateral en desktop; en mobile/tablet, barra superior (volver + tema) y barra de pestañas abajo,
/// al estilo de WhatsApp. Se logra con `order` + `contents`, sin duplicar el DOM.
export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="flex h-screen h-[100dvh] flex-col overflow-hidden lg:flex-row">
      <aside className="contents lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-black/5 lg:dark:border-white/10">
        <header className="order-1 flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2 lg:order-none lg:border-b-0 lg:px-4 lg:py-3 dark:border-white/10">
          <Link
            href="/"
            aria-label={t("admin.backToChat")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <IconArrowLeft size={20} stroke={1.75} />
          </Link>
          <span className="truncate font-display text-base font-semibold text-brand-ink lg:hidden dark:text-white">
            {t("admin.panelTitle")}
          </span>
          <ThemeToggle />
        </header>
        <nav className="order-3 flex border-t border-black/5 pb-[env(safe-area-inset-bottom)] lg:order-none lg:flex-col lg:gap-1 lg:border-t-0 lg:px-3 lg:py-2 lg:pb-2 dark:border-white/10">
          {ADMIN_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            const label = t(`admin.${item.labelKey}`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-center text-[11px] leading-tight text-neutral-500 hover:text-brand-ink lg:flex-none lg:flex-row lg:gap-2 lg:rounded-lg lg:px-3 lg:text-left lg:text-sm lg:text-brand-ink lg:hover:bg-black/5 dark:text-neutral-400 dark:hover:text-white lg:dark:text-white lg:dark:hover:bg-white/10",
                  isActive &&
                    "font-medium text-brand-blue hover:text-brand-blue lg:bg-black/5 lg:text-brand-blue dark:text-brand-blue-light dark:hover:text-brand-blue-light lg:dark:bg-white/10 lg:dark:text-brand-blue-light",
                )}
              >
                <Icon size={22} stroke={1.75} className="lg:h-4 lg:w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="order-2 flex min-h-0 flex-1 flex-col lg:order-none">{children}</main>
    </div>
  );
}
