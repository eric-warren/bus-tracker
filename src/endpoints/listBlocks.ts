import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from "fastify"
import {  getDateFromTimestamp } from "../utils/schedule.ts";
import sql from "../utils/database.ts";

interface ListBlocksQuery {
    date: string
}

const opts: RouteShorthandOptions = {
  schema: {
    querystring: {
        type: "object",
        properties: {
            date: {
                type: "string"
            }
        }
    },
    response: {
        200: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    blockId: {
                        type: "string"
                    },
                    busCount: {
                        type: "number"
                    }
                }
            }
        }
    }
  }
}

async function endpoint(request: FastifyRequest<{Querystring: ListBlocksQuery}>) {
    const date = new Date(request.query.date);
    const dayOnlyDate = getDateFromTimestamp(date);

    const blocks = await sql`SELECT block_id,
            count(DISTINCT bus_id) as bus_count FROM block_data
        WHERE date = ${dayOnlyDate.toLocaleDateString()}
        GROUP BY block_id`;
    
    return blocks.map((b) => ({
        blockId: b.block_id,
        busCount: b.bus_count
    }));
}

export function createListBlocksEndpoint(server: FastifyInstance) {
    server.get<{Querystring: ListBlocksQuery}>('/api/blocks', opts, endpoint);
}
