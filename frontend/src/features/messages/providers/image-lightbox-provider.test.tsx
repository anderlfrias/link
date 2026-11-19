import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageLightboxProvider, useImageLightbox } from "./image-lightbox-provider";
import { downloadFile } from "@/utils/download-file";

vi.mock("@/utils/download-file", () => ({
  downloadFile: vi.fn(),
}));

function TestConsumer() {
  const { open } = useImageLightbox();
  return (
    <button
      type="button"
      onClick={() => open({ url: "https://example.com/photo.jpg", name: "Vacaciones.jpg" })}
    >
      Abrir imagen
    </button>
  );
}

describe("ImageLightboxProvider and useImageLightbox", () => {
  it("throws error if useImageLightbox is used outside provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useImageLightbox debe usarse dentro de un ImageLightboxProvider",
    );
    consoleError.mockRestore();
  });

  it("opens lightbox dialog when open is called", () => {
    render(
      <ImageLightboxProvider>
        <TestConsumer />
      </ImageLightboxProvider>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir imagen" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-label", "Vacaciones.jpg");

    const img = screen.getByRole("img", { name: "Vacaciones.jpg" });
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
  });

  it("closes lightbox when clicking close button", () => {
    render(
      <ImageLightboxProvider>
        <TestConsumer />
      </ImageLightboxProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir imagen" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Cerrar"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes lightbox when pressing Escape key", () => {
    render(
      <ImageLightboxProvider>
        <TestConsumer />
      </ImageLightboxProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir imagen" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("triggers downloadFile when download button is clicked without closing dialog", () => {
    render(
      <ImageLightboxProvider>
        <TestConsumer />
      </ImageLightboxProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir imagen" }));

    const downloadBtn = screen.getByLabelText("Descargar imagen");
    fireEvent.click(downloadBtn);

    expect(downloadFile).toHaveBeenCalledWith("https://example.com/photo.jpg", "Vacaciones.jpg");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes lightbox when clicking overlay backdrop", () => {
    render(
      <ImageLightboxProvider>
        <TestConsumer />
      </ImageLightboxProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir imagen" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("álbum y video", () => {
    const album = [
      { url: "https://example.com/1.jpg", name: "uno.jpg" },
      { url: "https://example.com/2.mp4", name: "dos.mp4", kind: "video" as const },
      { url: "https://example.com/3.jpg", name: "tres.jpg" },
    ];

    function AlbumConsumer({ start = 0 }: { start?: number }) {
      const { open } = useImageLightbox();
      return (
        <button type="button" onClick={() => open(album[start], album)}>
          Abrir álbum
        </button>
      );
    }

    function openAlbum(start = 0) {
      render(
        <ImageLightboxProvider>
          <AlbumConsumer start={start} />
        </ImageLightboxProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Abrir álbum" }));
    }

    it("abre en la foto elegida con contador y navegación", () => {
      openAlbum(1);

      expect(screen.getByText("2 / 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Anterior" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeInTheDocument();
    });

    it("pasa de uno a otro con los botones y con las flechas del teclado, dando la vuelta", () => {
      openAlbum(0);

      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      expect(screen.getByText("2 / 3")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(screen.getByText("3 / 3")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(screen.getByText("1 / 3")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    });

    it("un video se muestra con reproductor y ofrece descargar video", () => {
      openAlbum(1);

      const video = document.querySelector("video");
      expect(video).not.toBeNull();
      expect(video).toHaveAttribute("src", "https://example.com/2.mp4");
      expect(screen.getByRole("button", { name: "Descargar video" })).toBeInTheDocument();
    });

    it("sin álbum no hay contador ni botones de navegación", () => {
      render(
        <ImageLightboxProvider>
          <TestConsumer />
        </ImageLightboxProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Abrir imagen" }));

      expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument();
      expect(screen.queryByText(/ \/ /)).not.toBeInTheDocument();
    });
  });
});
