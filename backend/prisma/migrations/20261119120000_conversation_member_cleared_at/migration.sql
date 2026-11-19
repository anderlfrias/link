-- "Vaciar chat" / "Eliminar chat" solo para uno mismo: los mensajes anteriores a cleared_at no se
-- le muestran a ese miembro. Columna nueva con NULL por defecto: no toca ningún dato existente.

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "cleared_at" TIMESTAMP(3);
