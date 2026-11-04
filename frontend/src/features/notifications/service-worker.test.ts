import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `public/sw.js` es un script plano que corre en el service worker, no pasa por el bundler. Se
// evalúa con un `self` falso para probar lo que decide: cuándo mostrar la notificación de una
// llamada, cuánto dejarla visible y adónde llevar al tocarla. Los tests corren con `frontend/`
// como directorio de trabajo (`npm run test --workspace=frontend`).
const SW_SOURCE = readFileSync(path.resolve(process.cwd(), "public/sw.js"), "utf8");

type Listener = (event: any) => void;

function fakeClient(url: string, overrides: Record<string, unknown> = {}) {
  return { url, focused: false, visibilityState: "hidden", focus: vi.fn(async () => undefined), ...overrides };
}

function loadServiceWorker(initialClients: ReturnType<typeof fakeClient>[] = []) {
  const listeners = new Map<string, Listener>();
  const notifications: { close: ReturnType<typeof vi.fn> }[] = [{ close: vi.fn() }];
  const fakeSelf = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => initialClients),
      openWindow: vi.fn(async () => undefined),
    },
    registration: {
      showNotification: vi.fn(async () => undefined),
      getNotifications: vi.fn(async () => notifications),
    },
  };
  // `setTimeout` del entorno de prueba, para que lo controlen los timers falsos.
  vm.runInNewContext(SW_SOURCE, {
    self: fakeSelf,
    URL,
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
  });

  async function dispatch(type: string, event: Record<string, unknown>) {
    const waiting: Promise<unknown>[] = [];
    listeners.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => waiting.push(promise) });
    await Promise.all(waiting);
  }

  const push = (payload: unknown) => dispatch("push", { data: { json: () => payload } });
  const click = (data: unknown) => dispatch("notificationclick", { notification: { close: vi.fn(), data } });

  return { fakeSelf, notifications, push, click, dispatch };
}

const callPayload = {
  title: "Dr. Roberto",
  body: "Llamada de voz entrante",
  url: "/conversations/conv-1",
  tag: "call-1",
  kind: "call",
  ringMs: 45_000,
};

describe("service worker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("push de llamada entrante", () => {
    it("sin la app en primer plano muestra una notificación que no se va sola, con vibración", async () => {
      const sw = loadServiceWorker([fakeClient("https://link.example.com/", { focused: false })]);

      const shown = sw.push(callPayload);
      await vi.advanceTimersByTimeAsync(0);

      expect(sw.fakeSelf.registration.showNotification).toHaveBeenCalledWith(
        "Dr. Roberto",
        expect.objectContaining({
          body: "Llamada de voz entrante",
          tag: "call-1",
          requireInteraction: true,
          renotify: true,
          data: { url: "/conversations/conv-1", kind: "call" },
        }),
      );
      await vi.advanceTimersByTimeAsync(45_000);
      await shown;
    });

    it("con la app en primer plano no la muestra: el modal de la llamada ya la anuncia", async () => {
      const sw = loadServiceWorker([fakeClient("https://link.example.com/", { focused: true })]);

      await sw.push(callPayload);

      expect(sw.fakeSelf.registration.showNotification).not.toHaveBeenCalled();
    });

    it("la deja visible lo que suena la llamada y después la retira", async () => {
      const sw = loadServiceWorker();

      const shown = sw.push({ ...callPayload, ringMs: 45_000 });
      await vi.advanceTimersByTimeAsync(44_999);
      expect(sw.fakeSelf.registration.getNotifications).not.toHaveBeenCalled();
      expect(sw.notifications[0].close).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await shown;

      expect(sw.fakeSelf.registration.getNotifications).toHaveBeenCalledWith({ tag: "call-1" });
      expect(sw.notifications[0].close).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, 0, -5, "45000", null])("sin una duración válida (%s) la retira a los 30 s", async (ringMs) => {
      const sw = loadServiceWorker();

      const shown = sw.push({ ...callPayload, ringMs });
      await vi.advanceTimersByTimeAsync(29_999);
      expect(sw.notifications[0].close).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await shown;

      expect(sw.notifications[0].close).toHaveBeenCalledTimes(1);
    });
  });

  describe("push de un mensaje", () => {
    it("muestra una notificación común, que no es de llamada", async () => {
      const sw = loadServiceWorker();

      await sw.push({ title: "Ana", body: "Hola", url: "/conversations/conv-2", tag: "conv-2", kind: "message" });

      const [, options] = sw.fakeSelf.registration.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(options).toMatchObject({ body: "Hola", tag: "conv-2", data: { url: "/conversations/conv-2" } });
      expect(options).not.toHaveProperty("requireInteraction");
      expect(sw.fakeSelf.registration.getNotifications).not.toHaveBeenCalled();
    });

    it("un push sin datos o con datos ilegibles no muestra nada", async () => {
      const sw = loadServiceWorker();

      await sw.dispatch("push", { data: null });
      await sw.dispatch("push", {
        data: {
          json: () => {
            throw new Error("no es JSON");
          },
        },
      });

      expect(sw.fakeSelf.registration.showNotification).not.toHaveBeenCalled();
    });
  });

  describe("al tocar la notificación", () => {
    it("de un mensaje: enfoca la ventana que ya está en esa conversación", async () => {
      const inConversation = fakeClient("https://link.example.com/conversations/conv-2");
      const elsewhere = fakeClient("https://link.example.com/admin");
      const sw = loadServiceWorker([elsewhere, inConversation]);

      await sw.click({ url: "/conversations/conv-2" });

      expect(inConversation.focus).toHaveBeenCalled();
      expect(elsewhere.focus).not.toHaveBeenCalled();
      expect(sw.fakeSelf.clients.openWindow).not.toHaveBeenCalled();
    });

    it("de un mensaje: si ninguna ventana está en esa conversación abre una", async () => {
      const sw = loadServiceWorker([fakeClient("https://link.example.com/admin")]);

      await sw.click({ url: "/conversations/conv-2" });

      expect(sw.fakeSelf.clients.openWindow).toHaveBeenCalledWith("/conversations/conv-2");
    });

    it("sin url abre la raíz", async () => {
      const sw = loadServiceWorker();

      await sw.click(undefined);

      expect(sw.fakeSelf.clients.openWindow).toHaveBeenCalledWith("/");
    });

    it("de una llamada: trae al frente la ventana que ya está abierta, en cualquier ruta, sin abrir otra ni navegarla", async () => {
      const visible = fakeClient("https://link.example.com/admin", { visibilityState: "visible" });
      const hidden = fakeClient("https://link.example.com/conversations/otra");
      const sw = loadServiceWorker([hidden, visible]);

      await sw.click({ url: "/conversations/conv-1", kind: "call" });

      expect(visible.focus).toHaveBeenCalled();
      expect(hidden.focus).not.toHaveBeenCalled();
      expect(sw.fakeSelf.clients.openWindow).not.toHaveBeenCalled();
    });

    it("de una llamada: prefiere la ventana enfocada y si no hay visible usa la primera", async () => {
      const focused = fakeClient("https://link.example.com/", { focused: true });
      const first = fakeClient("https://link.example.com/admin");
      const swFocused = loadServiceWorker([first, focused]);
      await swFocused.click({ url: "/x", kind: "call" });
      expect(focused.focus).toHaveBeenCalled();

      const swFirst = loadServiceWorker([first]);
      await swFirst.click({ url: "/x", kind: "call" });
      expect(first.focus).toHaveBeenCalled();
    });

    it("de una llamada con la app cerrada: abre una ventana en la conversación", async () => {
      const sw = loadServiceWorker();

      await sw.click({ url: "/conversations/conv-1", kind: "call" });

      expect(sw.fakeSelf.clients.openWindow).toHaveBeenCalledWith("/conversations/conv-1");
    });
  });
});
