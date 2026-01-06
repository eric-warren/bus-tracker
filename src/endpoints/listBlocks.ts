import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from "fastify"
import {  getDateFromTimestamp, getGtfsVersion, getServiceIds } from "../utils/schedule.ts";
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
    const serviceIds = await getServiceIds(dayOnlyDate);
    const gtfsVersion = await getGtfsVersion(dayOnlyDate);

    const blocks = await sql`SELECT block_id,
            count(DISTINCT bus_id) as bus_count FROM block_data
        WHERE date = ${dayOnlyDate.toLocaleDateString()}
        GROUP BY block_id`;

    const allBlocks = await sql`SELECT DISTINCT block_id FROM blocks
        WHERE gtfs_version = ${gtfsVersion} AND service_id IN ${sql(serviceIds)}`;

    const processedBlocks = blocks.map((b) => ({
        blockId: b.block_id,
        busCount: b.bus_count
    }));

    const processedBlockIds = new Set();
    for (const block of processedBlocks) {
        processedBlockIds.add(block.blockId);
    }

    for (const block of allBlocks) {
        if (!processedBlockIds.has(block.block_id)) {
            processedBlocks.push({
                blockId: block.block_id,
                busCount: 0
            });
        }
    }
    
    return processedBlocks;
}

export function createListBlocksEndpoint(server: FastifyInstance) {
    server.get<{Querystring: ListBlocksQuery}>('/api/blocks', opts, endpoint);
}
