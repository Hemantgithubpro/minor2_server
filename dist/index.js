import { config } from "dotenv";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { attachClientToRoom, onClientClose, onClientMessage } from "./relay.js";
config();
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 1234);
const pingIntervalMs = Number(process.env.PING_INTERVAL_MS ?? 30000);
const server = createServer();
const wss = new WebSocketServer({ server });
wss.on("connection", (socket, req) => {
    const liveSocket = socket;
    liveSocket.isAlive = true;
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const roomId = requestUrl.searchParams.get("room") ?? "phase1-room";
    const filePath = requestUrl.searchParams.get("file") ?? "README.md";
    const room = attachClientToRoom(socket, roomId, filePath);
    socket.on("pong", () => {
        liveSocket.isAlive = true;
    });
    socket.on("message", (data, isBinary) => {
        if (!isBinary) {
            return;
        }
        onClientMessage(socket, room, data);
    });
    socket.on("close", () => {
        onClientClose(socket, room);
    });
});
const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
        const liveSocket = socket;
        if (!liveSocket.isAlive) {
            liveSocket.terminate();
            continue;
        }
        liveSocket.isAlive = false;
        liveSocket.ping();
    }
}, pingIntervalMs);
wss.on("close", () => {
    clearInterval(heartbeat);
});
server.listen(port, host, () => {
    // Logging startup details helps LAN debugging during demos.
    console.log(`[phase1-server] listening on ws://${host}:${port}`);
});
