-- Ajustes de la app móvil en AppSettings:
-- - allow_mobile_app: si la organización acepta el uso de la app. Default false (solo un
--   admin lo habilita): hasta entonces la web no ofrece "Conectar app móvil".
-- - organization_name: nombre que ve la persona al vincular la app. Opcional, y público.
-- Columnas nuevas con default/NULL: no toca ningún dato existente.

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "allow_mobile_app" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organization_name" TEXT;
