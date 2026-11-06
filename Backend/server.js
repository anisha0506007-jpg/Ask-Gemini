import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 20_000;

app.use(cors({
    origin(origin, callback) {
        const isLocalLiveServer =
            !origin || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):5500$/.test(origin);
        callback(isLocalLiveServer ? null : new Error("Origin is not allowed by CORS"), isLocalLiveServer);
    }
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../Frontend")));

app.post("/ask", async (req, res) => {
    const { messages } = req.body ?? {};

    if (
        !Array.isArray(messages) ||
        messages.length === 0 ||
        messages.length > MAX_MESSAGES ||
        messages.some(
            (message) =>
                !message ||
                !["user", "model"].includes(message.role) ||
                typeof message.content !== "string" ||
                !message.content.trim() ||
                message.content.length > MAX_MESSAGE_LENGTH
        ) ||
        messages.at(-1)?.role !== "user"
    ) {
        return res.status(400).json({
            error: "Send a conversation ending with a non-empty user message (up to 40 messages)."
        });
    }

    if (!process.env.GEMINI_API_KEY?.trim()) {
        return res.status(503).json({
            error: "Gemini is not configured. Add GEMINI_API_KEY to Backend/.env and restart the server."
        });
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: messages.map(({ role, content }) => ({
                role,
                parts: [{ text: content }]
            }))
        });
        const answer = response.text?.trim();

        if (!answer) {
            return res.status(502).json({
                error: "Gemini returned an empty response. Try rephrasing your message."
            });
        }

        return res.json({ answer });
    } catch (error) {
        console.error("Gemini request failed:", error);

        const status = Number(error?.status);
        const details = typeof error?.message === "string" ? error.message : "";
        const safeDetails = details.replaceAll(process.env.GEMINI_API_KEY, "[redacted]");
        let message = "Gemini could not generate a response. Check the server logs and try again.";
        let responseStatus = 502;

        if (status === 401 || status === 403 || /api.?key|unauthorized|permission denied/i.test(details)) {
            message = "Gemini rejected the API key. Check that GEMINI_API_KEY in Backend/.env is valid and enabled for the Gemini API.";
            responseStatus = 502;
        } else if (status === 429) {
            message = "Gemini's request limit has been reached. Check your API quota and try again later.";
            responseStatus = 429;
        } else if (safeDetails) {
            message = `Gemini API error: ${safeDetails}`;
        }

        return res.status(responseStatus).json({ error: message });
    }
});

const port = Number(process.env.PORT) || 5000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
