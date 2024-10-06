import WebSocket from "ws";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello World");
});

// Serve streams.xml on /twiml
app.post("/twiml", (req, res) => {
  console.log("Received request to /twiml");
  res.sendFile(path.join(__dirname, "templates", "streams.xml"));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

wss.on("connection", (ws) => {
  console.log("Client connected");

  const openAIWs = new WebSocket(url, {
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openAIWs.on("open", function open() {
    console.log("Connected to OpenAI server.");
    openAIWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text", "speech"],
          instructions:
            "You are a helpful assistant. Respond to the user's audio input and generate speech output.",
        },
      })
    );
  });

  // Handle messages from the client (audio data)
  ws.on("message", (message) => {
    if (openAIWs.readyState === WebSocket.OPEN) {
      const audioBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message);
      const data = JSON.parse(message.toString());

      console.log("--- data ---");
      console.log(data);
      console.log("--- data ---");

      if (data.event === "media") {
        if (data.media.track == "inbound") {
          const rawAudio = Buffer.from(data.media.payload, "base64");
          openAIWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: rawAudio.toString("base64"), // Convert buffer to base64 string
            })
          );
        }
      }
    }
  });

  // Handle messages from OpenAI
  openAIWs.on("message", (message) => {
    const data = JSON.parse(message);
    console.log("Received message from OpenAI:", data);

    if (data.type === "speech.transcribe.result") {
      console.log("Transcription:", data.text);
      // Send the transcribed text back to OpenAI for processing
      openAIWs.send(
        JSON.stringify({
          type: "conversation.item.create",
          message: {
            role: "user",
            content: data.text,
          },
        })
      );
    } else if (data.type === "message.create.result") {
      console.log("Assistant response:", data.message.content);
      // Generate speech from the assistant's response
      openAIWs.send(
        JSON.stringify({
          type: "speech.generate",
          text: data.message.content,
        })
      );
    } else if (data.type === "speech.generate.result") {
      // Forward the generated speech to the client
      ws.send(Buffer.from(data.audio, "base64"));
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    openAIWs.close();
  });

  openAIWs.on("close", () => {
    console.log("Disconnected from OpenAI server");
    ws.close();
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
