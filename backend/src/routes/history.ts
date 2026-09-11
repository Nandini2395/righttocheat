import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { clearHistory, getHistory } from "../services/historyStore";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ history: getHistory() });
  })
);

router.delete(
  "/",
  asyncHandler(async (_req, res) => {
    clearHistory();
    res.json({ ok: true });
  })
);

export default router;
