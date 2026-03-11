import * as Y from "yjs";
import type WebSocket from "ws";
import { getOrCreateRoom, removeClient, type RoomState } from "./rooms.js";

const UPDATE_MESSAGE = 1;

function encodeMessage(type: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 1);
  out[0] = type;
  out.set(payload, 1);
  return out;
}

function decodeMessage(
  data: Buffer,
): { type: number; payload: Uint8Array } | null {
  if (data.length < 1) {
    return null;
  }

  return {
    type: data[0],
    payload: data.subarray(1),
  };
}

function sendStateSnapshot(socket: WebSocket, room: RoomState): void {
  const snapshot = Y.encodeStateAsUpdate(room.doc);
  socket.send(encodeMessage(UPDATE_MESSAGE, snapshot));
}

function broadcastUpdate(
  room: RoomState,
  update: Uint8Array,
  sender?: WebSocket,
): void {
  const message = encodeMessage(UPDATE_MESSAGE, update);

  for (const client of room.clients) {
    if (client === sender || client.readyState !== client.OPEN) {
      continue;
    }
    client.send(message);
  }
}

export function attachClientToRoom(
  socket: WebSocket,
  roomId: string,
  filePath: string,
): RoomState {
  const room = getOrCreateRoom(roomId, filePath);
  room.clients.add(socket);
  sendStateSnapshot(socket, room);
  return room;
}

export function onClientMessage(
  socket: WebSocket,
  room: RoomState,
  data: Buffer,
): void {
  const decoded = decodeMessage(data);
  if (!decoded) {
    return;
  }

  if (decoded.type === UPDATE_MESSAGE) {
    Y.applyUpdate(room.doc, decoded.payload);
    broadcastUpdate(room, decoded.payload, socket);
  }
}

export function onClientClose(socket: WebSocket, room: RoomState): void {
  removeClient(room, socket);
}
