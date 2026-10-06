import { createApp } from "./app";
import { config, isSearchConfigured } from "./config";

const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`VQA backend listening on http://localhost:${config.port}`);
  if (!isSearchConfigured()) {
    // eslint-disable-next-line no-console
    console.log("[info] Using keyless search (DuckDuckGo + Wikipedia). Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID for better results.");
  }
});
