import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
    root: resolve(process.cwd(), "public"),

    server: {
        port: 5173,

        proxy: {
            "/socket.io": {
                target: "http://localhost:3000",
                ws: true
            }
        }
    }
});