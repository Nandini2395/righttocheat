import { createApp } from "./app";
import { config, assertLlmConfigured, isSearchConfigured } from "./config";

const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`VQA backend listening on http://localhost:${config.port}`);
  const configError = assertLlmConfigured();
  if (configError) {
    // eslint-disable-next-line no-console
    console.warn(`[warn] ${configError}`);
  }
  if (!isSearchConfigured()) {
    // eslint-disable-next-line no-console
    console.warn("[warn] Google Search API not configured — verification will run without web search.");
  }
});
