import { type FastifyInstance, type FastifyReply, type FastifyRequest, type RouteShorthandOptions } from "fastify"
import {  getDateFromTimestamp, getGtfsVersion, getServiceIds, toDateString } from "../utils/schedule.ts";
import sql from "../utils/database.ts";

interface BlockCancelCountQuery {
    date: string;
    blockId: string;
}

const opts: RouteShorthandOptions = {
  schema: {
    querystring: {
        type: "object",
        properties: {
            date: {
                type: "string"
            },
            blockId: {
                type: "string"
            }
        }
    },
    response: {
        200: {
            type: "object",
            properties: {
                daysCanceled: {
                    type: "number"
                },
                allDays: {
                    type: "boolean"
                }
            }
        }
    }
  }
}

async function endpoint(request: FastifyRequest<{Querystring: BlockCancelCountQuery}>, reply: FastifyReply) {
    const date = new Date(request.query.date);
    const blockId = request.query.blockId;
    const dayOnlyDate = getDateFromTimestamp(date);
    const gtfsVersion = await getGtfsVersion(dayOnlyDate);
    const serviceIds = await getServiceIds(gtfsVersion, dayOnlyDate);

    if (!blockId) {
        reply.code(400).send();
        return;
    }

    // Get initial trip list
    const initialTrips = (await sql`SELECT schedule_relationship, b.trip_id, start_time, route_id, route_direction
        FROM blocks b LEFT JOIN canceled c ON b.trip_id = c.trip_id
        WHERE gtfs_version = ${gtfsVersion} AND service_id IN ${sql(serviceIds)}
        AND (c.date = ${toDateString(dayOnlyDate)} OR c.date IS NULL) AND block_id = ${blockId}`);
    
    // If not all cancelled, don't search
    if (!initialTrips.length || !initialTrips.every((c) => c.schedule_relationship)) {
        return {
            daysCanceled: 0,
            allDays: false
        };
    }

    let daysCanceled = 1;
    let daysNotCancelled = 0;
    let daysNotAvailable = 0;
    let daysBack = 1;
    // If the block is not scheduled for 2 days (weekend), it probably is now a different schedule
    // Go back each day chcking for cancellations
    while (!daysNotCancelled && daysNotAvailable <= 2) {
        const nextDay = new Date(dayOnlyDate);
        nextDay.setDate(nextDay.getDate() - daysBack);
        const nextDayGtfsVersion = await getGtfsVersion(nextDay);
        const nextDayServiceIds = await getServiceIds(nextDayGtfsVersion, nextDay);

        const canceled = await sql`SELECT schedule_relationship, b.trip_id, start_time, route_id, route_direction
            FROM blocks b LEFT JOIN canceled c ON b.trip_id = c.trip_id
            WHERE gtfs_version = ${nextDayGtfsVersion} AND service_id IN ${sql(nextDayServiceIds)}
            AND (c.date = ${toDateString(nextDay)} OR c.date IS NULL) AND block_id = ${blockId}`;

        if (canceled.length !== initialTrips.length
                || !canceled.every((c) => initialTrips.find((i) => c.start_time === i.start_time
                    && c.route_id === i.route_id && c.route_direction === i.route_direction))) {
            // Block is different from initial (weekend, or old schedule)
            daysNotAvailable++;
        } else if (canceled.every((c) => c.schedule_relationship)) {
            daysCanceled++;
            daysNotAvailable = 0;
        } else {
            daysNotCancelled++;
        }

        daysBack++;        
    }

    return {
        daysCanceled,
        allDays: !daysNotCancelled
    }
}

export function createBlockCancelCountEndpoint(server: FastifyInstance) {
    server.get<{Querystring: BlockCancelCountQuery}>('/api/blockCancelCount', opts, endpoint);
}
