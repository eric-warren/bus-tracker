import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getCacheStats } from "../utils/cacheManager.ts";

async function getCacheStatsEndpoint(request: FastifyRequest, reply: FastifyReply) {
    try {
        const stats = await getCacheStats();
        reply.send(stats);
    } catch (error) {
        reply.status(500).send({ error: "Failed to retrieve cache statistics" });
    }
}

export function createCacheEndpoints(server: FastifyInstance) {
    server.get("/api/cache/stats", getCacheStatsEndpoint);
}
