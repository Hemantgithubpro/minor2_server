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
function toBuffer(data) {
    if (Buffer.isBuffer(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return Buffer.concat(data);
    }
    return Buffer.from(data);
}
wss.on("connection", (socket, req) => {
    const liveSocket = socket;
    liveSocket.isAlive = true;
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const roomId = requestUrl.searchParams.get("room") ?? "phase1-room";
    const filePath = requestUrl.searchParams.get("file") ?? "README.md";
    const room = attachClientToRoom(socket, roomId, filePath);
    console.log("[phase1-server] client connected", {
        remoteAddress: req.socket.remoteAddress,
        roomId,
        filePath,
    });
    socket.on("pong", () => {
        liveSocket.isAlive = true;
    });
    socket.on("message", (data, isBinary) => {
        if (!isBinary) {
            return;
        }
        try {
            onClientMessage(socket, room, toBuffer(data));
        }
        catch (error) {
            console.error("[phase1-server] message parse error", {
                remoteAddress: req.socket.remoteAddress,
                roomId,
                filePath,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    socket.on("close", () => {
        console.log("[phase1-server] client disconnected", {
            remoteAddress: req.socket.remoteAddress,
            roomId,
            filePath,
        });
        onClientClose(socket, room);
    });
    socket.on("error", (error) => {
        console.error("[phase1-server] socket error", {
            remoteAddress: req.socket.remoteAddress,
            roomId,
            filePath,
            message: error.message,
        });
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
