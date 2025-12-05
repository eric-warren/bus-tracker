import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { config } from "./config.ts";
import sql from "./database.ts";

const apiUrl = "https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-vp/beta/v1/VehiclePositions";

export async function fetchRealtime(): Promise<void> {
    const response = await fetch(apiUrl, {
        headers: {
            "Ocp-Apim-Subscription-Key": config.ocApiKey
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch real-time data: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    const time = new Date();
    console.log(`Fetched GTFS-Realtime data at ${new Date(time).toISOString()}`);

    const promises = [];

    for (const entity of feed.entity) {
        if (entity.vehicle && entity.vehicle.vehicle && entity.vehicle.vehicle.id && entity.vehicle.position) {
            const busId = entity.vehicle.vehicle.id;
            const tripId = entity.vehicle.trip?.tripId || null;
            const tripStartTime = entity.vehicle.trip?.startTime || null;
            const latitude = entity.vehicle.position.latitude;
            const longitude = entity.vehicle.position.longitude;
            const speed = entity.vehicle.position.speed || null;
            const recorded_timestamp = entity.vehicle.timestamp!.toString();

            promises.push((async () => {
                await sql`
                    INSERT INTO vehicles (time, id, trip_id, trip_start_time, latitude, longitude, speed, recorded_timestamp)
                    VALUES (${time}, ${busId}, ${tripId}, ${tripStartTime}, ${latitude}, ${longitude}, ${speed}, to_timestamp(${recorded_timestamp}))
                `;

                // Check if it is starting a new trip
                if (tripId && parseInt(entity.vehicle!.trip!.routeId ?? "900") < 800) {
                    const existingTrip = await sql`
                        SELECT * from block_data
                        WHERE date = CURRENT_DATE AND trip_id = ${tripId}
                    `;

                    if (!existingTrip.length) {
                        console.log(`Starting new trip for vehicle ${busId} with trip ID ${tripId}`);
                        const blockData = await sql`
                            SELECT block_id, route_id, route_direction FROM blocks
                            WHERE trip_id = ${tripId}
                            ORDER BY gtfs_version DESC
                            LIMIT 1
                        `;

                        if (!blockData[0]) {
                            console.warn(`No block data found for trip ID ${tripId}`);
                            return;
                        }

                        await sql`
                            INSERT INTO block_data (date, trip_id, block_id, bus_id, route_id, route_direction, start_time)
                            VALUES (CURRENT_DATE, ${tripId}, ${blockData[0].block_id}, ${busId}, ${blockData[0].route_id}, ${blockData[0].route_direction}, ${tripStartTime})
                        `;
                    }
                }
            })());
        }
    }

    await Promise.all(promises);
}