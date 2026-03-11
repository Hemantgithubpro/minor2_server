import * as Y from "yjs";
const rooms = new Map();
export function toRoomKey(roomId, filePath) {
    return `${roomId}:${filePath}`;
}
export function getOrCreateRoom(roomId, filePath) {
    const key = toRoomKey(roomId, filePath);
    const existing = rooms.get(key);
    if (existing) {
        return existing;
    }
    const room = {
        key,
        roomId,
        filePath,
        doc: new Y.Doc(),
        clients: new Set(),
    };
    rooms.set(key, room);
    return room;
}
export function removeClient(room, socket) {
    room.clients.delete(socket);
}
