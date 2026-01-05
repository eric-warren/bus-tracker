import sql from "./database.ts";
import { toDateString } from "./fetchRealtime.ts";

interface SerciceIdQuery {
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
}

export async function getServiceIds(date: Date): Promise<string[]> {
    const dateString = toDateString(date);
    const query = dateToServiceIdQuery(date);

    const serviceIds = await sql`SELECT service_id FROM calendar WHERE
        monday = ${query.monday} AND
        tuesday = ${query.tuesday} AND
        wednesday = ${query.wednesday} AND
        thursday = ${query.thursday} AND
        friday = ${query.friday} AND
        saturday = ${query.saturday} AND
        sunday = ${query.sunday} AND
        start_date <= ${dateString} AND
        end_date >= ${dateString}
    `;
    const serviceIdsExceptions = await sql`SELECT service_id, exception_type FROM calendar_dates WHERE date = ${dateString}`;

    const initialServiceIds = new Set<string>(serviceIds.map((row: any) => row.service_id));
    for (const row of serviceIdsExceptions) {
        if (row.exception_type === 1) {
            initialServiceIds.add(row.service_id);
        } else {
            initialServiceIds.delete(row.service_id);
        }
    }

    return Array.from(initialServiceIds);
}

function dateToServiceIdQuery(date: Date): SerciceIdQuery {
    const day = date.getDay();

    return {
        monday: day === 1 ? 1 : 0,
        tuesday: day === 2 ? 1 : 0,
        wednesday: day === 3 ? 1 : 0,
        thursday: day === 4 ? 1 : 0,
        friday: day === 5 ? 1 : 0,
        saturday: day === 6 ? 1 : 0,
        sunday: day === 0 ? 1 : 0,
    };
}