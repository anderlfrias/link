import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageAttachments } from "./MessageAttachments";
import { useImageLightbox } from "@/features/messages/providers/image-lightbox-provider";
import { downloadFile } from "@/utils/download-file";
import type { MessageFile } from "@/features/messages/types/message.types";

vi.mock("@/features/messages/providers/image-lightbox-provider", () => ({
  useImageLightbox: vi.fn(),
}));

vi.mock("@/utils/download-file", () => ({
  downloadFile: vi.fn(),
}));

describe("MessageAttachments", () => {
  const mockOpenLightbox = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useImageLightbox).mockReturnValue({ open: mockOpenLightbox });
  });

  it("returns null when files array is empty", () => {
    const { container } = render(<MessageAttachments files={[]} isOwn={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders deleted file message when file.deletedAt is set", () => {
    const files: MessageFile[] = [
      {
        id: "mf-1",
        messageId: "m-1",
        fileId: "f-1",
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: "f-1",
          path: "uploads/old.pdf",
          originalName: "reporte.pdf",
          mimeType: "application/pdf",
          extension: "pdf",
          size: 1024,
          deletedAt: "2026-09-09T11:00:00Z",
        } as any,
      },
    ];

    render(<MessageAttachments files={files} isOwn={false} />);

    expect(screen.getByText("reporte.pdf")).toBeInTheDocument();
    expect(screen.getByText("Este archivo ya no está disponible: fue eliminado.")).toBeInTheDocument();
  });

  it("renders image attachment and opens lightbox on click", () => {
    const files: MessageFile[] = [
      {
        id: "mf-2",
        messageId: "m-1",
        fileId: "f-2",
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: "f-2",
          path: "uploads/foto.jpg",
          originalName: "foto.jpg",
          mimeType: "image/jpeg",
          extension: "jpg",
          size: 2048,
          deletedAt: null,
        } as any,
      },
    ];

    render(<MessageAttachments files={files} isOwn={false} />);

    const imgBtn = screen.getByLabelText("Ver imagen foto.jpg");
    fireEvent.click(imgBtn);

    expect(mockOpenLightbox).toHaveBeenCalledWith({
      url: expect.stringContaining("foto.jpg"),
      name: "foto.jpg",
    });
  });

  it("renders downloadable generic file and calls downloadFile on click", () => {
    const files: MessageFile[] = [
      {
        id: "mf-3",
        messageId: "m-1",
        fileId: "f-3",
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: "f-3",
          path: "uploads/data.csv",
          originalName: "data.csv",
          mimeType: "text/csv",
          extension: "csv",
          size: 512,
          deletedAt: null,
        } as any,
      },
    ];

    render(<MessageAttachments files={files} isOwn={false} />);

    const fileBtn = screen.getByRole("button");
    expect(screen.getByText("data.csv")).toBeInTheDocument();
    expect(screen.getByText("512 B")).toBeInTheDocument();

    fireEvent.click(fileBtn);
    expect(downloadFile).toHaveBeenCalledWith(expect.stringContaining("data.csv"), "data.csv");
  });

  it("uses signed file.url for image lightbox and download", () => {
    const files: MessageFile[] = [
      {
        id: "mf-signed",
        messageId: "m-1",
        fileId: "f-signed",
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: "f-signed",
          originalName: "foto.png",
          mimeType: "image/png",
          extension: "png",
          size: 1024,
          url: "/api/v1/files/f-signed/content?t=hmac-123",
          deletedAt: null,
        } as any,
      },
    ];

    render(<MessageAttachments files={files} isOwn={false} />);
    const imgBtn = screen.getByLabelText("Ver imagen foto.png");
    fireEvent.click(imgBtn);

    expect(mockOpenLightbox).toHaveBeenCalledWith({
      url: "http://localhost:4000/api/v1/files/f-signed/content?t=hmac-123",
      name: "foto.png",
    });
  });

  it("handles very long filenames with flex containment and ellipsis", () => {
    const veryLongName = "documento_de_prueba_con_nombre_extremadamente_largo_para_verificar_el_desbordamiento_del_chat_en_pantallas_moviles.pdf";
    const files: MessageFile[] = [
      {
        id: "mf-long",
        messageId: "m-1",
        fileId: "f-long",
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: "f-long",
          originalName: veryLongName,
          mimeType: "application/pdf",
          extension: "pdf",
          size: 1048576,
          deletedAt: null,
        } as any,
      },
    ];

    const { container } = render(<MessageAttachments files={files} isOwn={false} />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("w-full", "max-w-full", "min-w-0");
    const titleEl = screen.getByText(veryLongName);
    expect(titleEl).toHaveClass("truncate");
    expect(titleEl).toHaveAttribute("title", veryLongName);
    expect(container.firstChild).toHaveClass("min-w-0", "max-w-full");
  });

  describe("agrupado de fotos y videos", () => {
    function mediaFile(index: number, mimeType = "image/jpeg"): MessageFile {
      const ext = mimeType.startsWith("video/") ? "mp4" : "jpg";
      return {
        id: `mf-${index}`,
        messageId: "m-1",
        fileId: `f-${index}`,
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: `f-${index}`,
          originalName: `archivo${index}.${ext}`,
          mimeType,
          extension: ext,
          size: 1024,
          url: `/api/v1/files/f-${index}/content?t=h${index}`,
          deletedAt: null,
        } as any,
      };
    }

    it("hasta 3 fotos NO se agrupan: cada una va en línea como siempre", () => {
      render(<MessageAttachments files={[mediaFile(1), mediaFile(2), mediaFile(3)]} isOwn={false} />);

      expect(screen.queryByRole("group")).not.toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(3);
    });

    it("4 fotos se agrupan en una cuadrícula con todas las miniaturas y sin '+N'", () => {
      render(<MessageAttachments files={[1, 2, 3, 4].map((i) => mediaFile(i))} isOwn={false} />);

      expect(screen.getByRole("group", { name: "4 fotos y videos" })).toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(4);
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });

    it("con más de 4 muestra 4 miniaturas y '+N' en la última", () => {
      render(<MessageAttachments files={[1, 2, 3, 4, 5, 6, 7].map((i) => mediaFile(i))} isOwn={false} />);

      expect(screen.getAllByRole("button")).toHaveLength(4);
      expect(screen.getByText("+3")).toBeInTheDocument();
    });

    it("tocar una miniatura abre el visor sobre todo el grupo, incluidas las que no se ven", () => {
      render(<MessageAttachments files={[1, 2, 3, 4, 5, 6].map((i) => mediaFile(i))} isOwn={false} />);

      fireEvent.click(screen.getByRole("button", { name: "Ver imagen archivo2.jpg" }));

      expect(mockOpenLightbox).toHaveBeenCalledTimes(1);
      const [item, album] = mockOpenLightbox.mock.calls[0];
      expect(item.name).toBe("archivo2.jpg");
      expect(album).toHaveLength(6);
    });

    it("los videos se agrupan con las fotos y se marcan como video en el visor", () => {
      const files = [mediaFile(1), mediaFile(2, "video/mp4"), mediaFile(3), mediaFile(4)];
      render(<MessageAttachments files={files} isOwn={false} />);

      fireEvent.click(screen.getByRole("button", { name: "Ver video archivo2.mp4" }));

      const [item, album] = mockOpenLightbox.mock.calls[0];
      expect(item.kind).toBe("video");
      expect(album.map((entry: { kind: string }) => entry.kind)).toEqual(["image", "video", "image", "image"]);
    });

    it("los archivos que no son fotos ni videos quedan fuera de la cuadrícula", () => {
      const doc = {
        ...mediaFile(9, "application/pdf"),
        id: "mf-doc",
        file: { ...mediaFile(9, "application/pdf").file, originalName: "informe.pdf" },
      } as MessageFile;
      render(<MessageAttachments files={[...[1, 2, 3, 4].map((i) => mediaFile(i)), doc]} isOwn={false} />);

      expect(screen.getByRole("group", { name: "4 fotos y videos" })).toBeInTheDocument();
      expect(screen.getByText("informe.pdf")).toBeInTheDocument();
    });

    it("las fotos eliminadas no cuentan para agrupar", () => {
      const deleted = { ...mediaFile(4), file: { ...mediaFile(4).file, deletedAt: "2026-09-09T11:00:00Z" } } as MessageFile;
      render(<MessageAttachments files={[mediaFile(1), mediaFile(2), mediaFile(3), deleted]} isOwn={false} />);

      expect(screen.queryByRole("group")).not.toBeInTheDocument();
    });
  });
});
