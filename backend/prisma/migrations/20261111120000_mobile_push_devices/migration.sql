-- Dispositivos móviles registrados para las notificaciones push de la app de LINK
-- (servicio push de Expo). Tabla nueva: no toca ningún dato existente.
--
-- Al borrarse un usuario se borran sus dispositivos (ON DELETE CASCADE). Además,
-- la aplicación los da de baja al cerrar sus sesiones (cuenta desactivada,
-- contraseña restablecida) y cuando Expo informa que el token ya no es válido.

-- CreateTable
CREATE TABLE "mobile_push_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_push_devices_token_key" ON "mobile_push_devices"("token");

-- CreateIndex
CREATE INDEX "mobile_push_devices_user_id_idx" ON "mobile_push_devices"("user_id");

-- AddForeignKey
ALTER TABLE "mobile_push_devices" ADD CONSTRAINT "mobile_push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
