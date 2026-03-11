import WebSocket from "ws";
import * as Y from "yjs";

const UPDATE_MESSAGE = 1;

function encodeUpdate(update: Uint8Array): Uint8Array {
  const out = new Uint8Array(update.length + 1);
  out[0] = UPDATE_MESSAGE;
  out.set(update, 1);
  return out;
}

function decodeUpdate(data: Buffer): Uint8Array | null {
  if (data.length < 2 || data[0] !== UPDATE_MESSAGE) {
    return null;
  }
  return data.subarray(1);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timeout waiting for: ${label}`);
    }
    await delay(25);
  }
}

class SimClient {
  readonly name: string;
  readonly doc: Y.Doc;
  readonly text: Y.Text;
  private readonly wsUrl: string;
  private readonly room: string;
  private readonly file: string;
  private socket: WebSocket | null = null;
  private pending: Uint8Array[] = [];
  private connected = false;

  constructor(name: string, wsUrl: string, room: string, file: string) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.room = room;
    this.file = file;
    this.doc = new Y.Doc();
    this.text = this.doc.getText("content");

    this.doc.on("update", (update, origin) => {
      if (origin === this) {
        return;
      }

      if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(encodeUpdate(update));
        return;
      }

      this.pending.push(update);
    });
  }

  connect(): Promise<void> {
    const url = new URL(this.wsUrl);
    url.searchParams.set("room", this.room);
    url.searchParams.set("file", this.file);

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;

      socket.on("open", () => {
        this.connected = true;
        this.flushPending();
        resolve();
      });

      socket.on("message", (raw) => {
        if (!(raw instanceof Buffer)) {
          return;
        }

        const update = decodeUpdate(raw);
        if (!update) {
          return;
        }

        Y.applyUpdate(this.doc, update, this);
      });

      socket.on("close", () => {
        this.connected = false;
      });

      socket.on("error", (error) => {
        reject(error);
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
  }

  destroy(): void {
    this.disconnect();
    this.doc.destroy();
  }

  insert(value: string): void {
    this.text.insert(this.text.length, value);
  }

  value(): string {
    return this.text.toString();
  }

  private flushPending(): void {
    if (
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    for (const update of this.pending) {
      this.socket.send(encodeUpdate(update));
    }
    this.pending = [];
  }
}

async function main(): Promise<void> {
  const wsUrl = process.env.PHASE1_WS_URL ?? "ws://127.0.0.1:1234";
  const room = process.env.PHASE1_ROOM ?? "phase1-room";
  const file = process.env.PHASE1_FILE ?? "src/main.js";

  const clientA = new SimClient("A", wsUrl, room, file);
  const clientB = new SimClient("B", wsUrl, room, file);

  try {
    console.log(`[validate] Connecting to ${wsUrl} room=${room} file=${file}`);
    await Promise.all([clientA.connect(), clientB.connect()]);

    clientA.insert("A:hello\n");
    await waitFor(
      () => clientB.value().includes("A:hello"),
      3000,
      "A->B initial sync",
    );

    for (let i = 0; i < 200; i += 1) {
      clientA.insert(`a${i}|`);
      clientB.insert(`b${i}|`);
    }

    await waitFor(
      () => clientA.value() === clientB.value(),
      5000,
      "burst typing convergence",
    );
    console.log("[validate] Burst typing convergence: PASS");

    clientB.disconnect();
    clientB.insert("B:offline-edit\n");
    clientA.insert("A:online-while-B-offline\n");

    await delay(300);
    await clientB.connect();
    await waitFor(
      () => clientA.value() === clientB.value(),
      6000,
      "reconnect convergence",
    );
    console.log("[validate] Reconnect convergence: PASS");

    console.log("[validate] Final text length:", clientA.value().length);
    console.log("[validate] Local simulation complete: PASS");
  } finally {
    clientA.destroy();
    clientB.destroy();
  }
}

main().catch((error) => {
  console.error("[validate] FAILED", error);
  process.exit(1);
});
