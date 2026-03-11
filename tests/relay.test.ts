import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  attachClientToRoom,
  onClientClose,
  onClientMessage,
} from "../src/relay.js";

class MockSocket {
  readonly OPEN = 1;
  readyState = 1;
  sent: Uint8Array[] = [];

  send(data: Uint8Array): void {
    this.sent.push(data);
  }
}

function makeRoomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

describe("relay", () => {
  it("sends a snapshot when a client joins", () => {
    const socket = new MockSocket();

    attachClientToRoom(socket as never, makeRoomId("join"), "README.md");

    expect(socket.sent.length).toBe(1);
    expect(socket.sent[0][0]).toBe(1);
  });

  it("applies update messages to room state and broadcasts to peers", () => {
    const sender = new MockSocket();
    const receiver = new MockSocket();
    const roomId = makeRoomId("update");

    const room = attachClientToRoom(sender as never, roomId, "src/main.js");
    attachClientToRoom(receiver as never, roomId, "src/main.js");

    sender.sent = [];
    receiver.sent = [];

    const sourceDoc = new Y.Doc();
    sourceDoc.getText("content").insert(0, "hello-sync");
    const update = Y.encodeStateAsUpdate(sourceDoc);

    const packet = Buffer.from(new Uint8Array([1, ...update]));
    onClientMessage(sender as never, room, packet);

    expect(sender.sent.length).toBe(0);
    expect(receiver.sent.length).toBe(1);
    expect(receiver.sent[0][0]).toBe(1);
    expect(room.doc.getText("content").toString()).toBe("hello-sync");

    sourceDoc.destroy();
  });

  it("broadcasts awareness messages without mutating room document", () => {
    const sender = new MockSocket();
    const receiver = new MockSocket();
    const roomId = makeRoomId("awareness");

    const room = attachClientToRoom(sender as never, roomId, "src/main.js");
    attachClientToRoom(receiver as never, roomId, "src/main.js");

    sender.sent = [];
    receiver.sent = [];

    const packet = Buffer.from(new Uint8Array([2, 9, 8, 7]));
    onClientMessage(sender as never, room, packet);

    expect(sender.sent.length).toBe(0);
    expect(receiver.sent.length).toBe(1);
    expect(receiver.sent[0][0]).toBe(2);
    expect(Array.from(receiver.sent[0].subarray(1))).toEqual([9, 8, 7]);
    expect(room.doc.getText("content").toString()).toBe("");
  });

  it("removes disconnected clients from room membership", () => {
    const sender = new MockSocket();
    const room = attachClientToRoom(
      sender as never,
      makeRoomId("close"),
      "README.md",
    );

    expect(room.clients.size).toBe(1);

    onClientClose(sender as never, room);
    expect(room.clients.size).toBe(0);
  });
});
