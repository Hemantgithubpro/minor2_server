import * as Y from "yjs";
import { getOrCreateRoom, removeClient } from "./rooms.js";
const UPDATE_MESSAGE = 1;
const AWARENESS_MESSAGE = 2;
function encodeMessage(type, payload) {
    const out = new Uint8Array(payload.length + 1);
    out[0] = type;
    out.set(payload, 1);
    return out;
}
function decodeMessage(data) {
    if (data.length < 1) {
        return null;
    }
    return {
        type: data[0],
        payload: data.subarray(1),
    };
}
function sendStateSnapshot(socket, room) {
    const snapshot = Y.encodeStateAsUpdate(room.doc);
    socket.send(encodeMessage(UPDATE_MESSAGE, snapshot));
}
function broadcastUpdate(room, update, sender) {
    const message = encodeMessage(UPDATE_MESSAGE, update);
    for (const client of room.clients) {
        if (client === sender || client.readyState !== client.OPEN) {
            continue;
        }
        client.send(message);
    }
}
export function attachClientToRoom(socket, roomId, filePath) {
    const room = getOrCreateRoom(roomId, filePath);
    room.clients.add(socket);
    sendStateSnapshot(socket, room);
    return room;
}
export function onClientMessage(socket, room, data) {
    const decoded = decodeMessage(data);
    if (!decoded) {
        return;
    }
    if (decoded.type === UPDATE_MESSAGE) {
        Y.applyUpdate(room.doc, decoded.payload);
        broadcastUpdate(room, decoded.payload, socket);
        return;
    }
    if (decoded.type === AWARENESS_MESSAGE) {
        const message = encodeMessage(AWARENESS_MESSAGE, decoded.payload);
        for (const client of room.clients) {
            if (client === socket || client.readyState !== client.OPEN) {
                continue;
            }
            client.send(message);
        }
    }
}
export function onClientClose(socket, room) {
    removeClient(room, socket);
}
