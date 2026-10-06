import { createApp } from "../backend/src/app";

// Vercel serves everything under /api/* from this function. The Express app already
// mounts its routes at /api/..., and Vercel passes the full original path through,
// so the existing route paths work unchanged.
export default createApp();
