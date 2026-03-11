import * as Y from "yjs";
import type WebSocket from "ws";

export type RoomKey = string;

export interface RoomState {
  key: RoomKey;
  roomId: string;
  filePath: string;
  doc: Y.Doc;
  clients: Set<WebSocket>;
}

const rooms = new Map<RoomKey, RoomState>();

export function toRoomKey(roomId: string, filePath: string): RoomKey {
  return `${roomId}:${filePath}`;
}

export function getOrCreateRoom(roomId: string, filePath: string): RoomState {
  const key = toRoomKey(roomId, filePath);
  const existing = rooms.get(key);
  if (existing) {
    return existing;
  }

  const room: RoomState = {
    key,
    roomId,
    filePath,
    doc: new Y.Doc(),
    clients: new Set<WebSocket>(),
  };

  rooms.set(key, room);
  return room;
}

export function removeClient(room: RoomState, socket: WebSocket): void {
  room.clients.delete(socket);
}
