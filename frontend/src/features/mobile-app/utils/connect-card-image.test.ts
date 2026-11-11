import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, drawConnectCard, renderConnectCardPng } from "./connect-card-image";

/** jsdom no implementa `<canvas>`: se reemplaza el contexto 2D por uno que
 * registra lo que se dibuja, con un ancho de texto proporcional a la fuente. */
function createFakeContext() {
  const context = {
    font: "",
    fillStyle: "",
    textAlign: "",
    textBaseline: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => {
      const px = Number(/(\d+)px/.exec(context.font)?.[1] ?? 10);
      return { width: text.length * px * 0.5 };
    }),
  };
  return context;
}

const content = {
  matrix: [
    [true, false, true],
    [false, true, false],
    [true, true, true],
  ],
  url: "https://chat.empresa.com",
  title: "Conecta la app LINK",
  hint: "Escanea este código desde la app",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("drawConnectCard", () => {
  it("pinta el fondo, un rectángulo por módulo oscuro y los tres textos", () => {
    const ctx = createFakeContext();

    drawConnectCard(ctx as unknown as CanvasRenderingContext2D, content);

    const darkModules = content.matrix.flat().filter(Boolean).length;
    // El primer fillRect es el fondo blanco de toda la tarjeta.
    expect(ctx.fillRect).toHaveBeenCalledTimes(1 + darkModules);
    expect(ctx.fillText.mock.calls.map((call) => call[0])).toEqual([content.title, content.url, content.hint]);
  });

  it("dibuja los módulos con tamaño entero y sin salirse de la tarjeta", () => {
    const ctx = createFakeContext();

    drawConnectCard(ctx as unknown as CanvasRenderingContext2D, content);

    const [, ...modules] = ctx.fillRect.mock.calls as [number, number, number, number][];
    for (const [x, y, width, height] of modules) {
      expect(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(width)).toBe(true);
      expect(width).toBe(height);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(720);
    }
  });

  it("achica la fuente de una URL larga en vez de cortarla", () => {
    const shortCtx = createFakeContext();
    const longCtx = createFakeContext();
    const longUrl = `https://${"sub.".repeat(25)}empresa.com`;
    const fontAt = (ctx: ReturnType<typeof createFakeContext>, text: string) => {
      let font = "";
      ctx.fillText.mockImplementation((drawn: string) => {
        if (drawn === text) font = ctx.font;
      });
      return () => Number(/(\d+)px/.exec(font)?.[1]);
    };
    const shortFont = fontAt(shortCtx, content.url);
    const longFont = fontAt(longCtx, longUrl);

    drawConnectCard(shortCtx as unknown as CanvasRenderingContext2D, content);
    drawConnectCard(longCtx as unknown as CanvasRenderingContext2D, { ...content, url: longUrl });

    expect(longFont()).toBeLessThan(shortFont());
    // El texto se dibuja completo.
    expect(longCtx.fillText.mock.calls.some((call) => call[0] === longUrl)).toBe(true);
  });
});

describe("renderConnectCardPng", () => {
  it("devuelve el PNG que genera el canvas", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      createFakeContext() as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(png));

    await expect(renderConnectCardPng(content)).resolves.toBe(png);
  });

  it("falla si el navegador no da un contexto 2D", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    await expect(renderConnectCardPng(content)).rejects.toThrow();
  });

  it("falla si el canvas no puede exportar el PNG", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      createFakeContext() as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));

    await expect(renderConnectCardPng(content)).rejects.toThrow();
  });
});

describe("downloadBlob", () => {
  it("descarga el blob con el nombre pedido y libera la URL temporal", () => {
    const createObjectURL = vi.fn(() => "blob:tarjeta");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
    });

    downloadBlob(new Blob(["png"], { type: "image/png" }), "link-app.png");

    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe("link-app.png");
    expect(clicked!.href).toBe("blob:tarjeta");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:tarjeta");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
