import WebSocket from "ws";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello World");
});

// Serve streams.xml on /twilm
app.post("/twiml", (req, res) => {
  console.log("Received request to /twiml");
  res.sendFile(path.join(__dirname, "templates", "streams.xml"));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
const openAIWs = new WebSocket(url, {
  headers: {
    Authorization: "Bearer " + process.env.OPENAI_API_KEY,
    "OpenAI-Beta": "realtime=v1",
  },
});

wss.on("connection", (ws) => {
  console.log("Client connected");

  openAIWs.on("open", function open() {
    console.log("Connected to OpenAI server.");
    openAIWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text"],
          instructions: "Please assist the user.",
        },
      })
    );
  });

  // Handle messages from the client
  ws.on("message", (message) => {
    console.log("Received message from client:", message.toString());
    // Forward the message to OpenAI
    openAIWs.send(message);
  });

  // Handle messages from OpenAI
  openAIWs.on("message", (message) => {
    console.log("Received message from OpenAI:", message.toString());
    // Forward the message to the client
    ws.send(message);
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
