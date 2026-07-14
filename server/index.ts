import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3456", 10);
const host = process.env.HOST ?? "127.0.0.1";

const app = createApp();

app.listen(port, host, () => {
  console.log(`Model Manager API listening at http://${host}:${port}`);
});
