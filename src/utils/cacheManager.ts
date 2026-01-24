import sql from './database.ts';
import { getDateFromTimestamp, toDateString } from './schedule.ts';

export interface Counts {
    totalScheduled: number;
    evaluatedTrips: number;
    onTimeTrips: number;
    canceledTrips: number;
}

export interface AggregateWithDelays {
    counts: Counts;
    delays: number[];
}

export interface CachedAggregates {
    overall: AggregateWithDelays;
    routes: Record<string, AggregateWithDelays>;
    buckets: Record<string, AggregateWithDelays>;
    routeOverall: AggregateWithDelays;
    routeBuckets: Record<string, AggregateWithDelays>;
}

let cacheTableInitialized = false;

export async function ensureCacheTableExists(): Promise<void> {
    if (cacheTableInitialized) return;

    try {
        await sql`DROP TABLE IF EXISTS cache_on_time_performance CASCADE`;

        await sql`
            CREATE TABLE IF NOT EXISTS cache_on_time_daily (
                service_date DATE NOT NULL,
                metric VARCHAR(20) NOT NULL,
                threshold_minutes INT NOT NULL,
                include_canceled BOOLEAN NOT NULL,
                frequency_filter VARCHAR(20) NOT NULL,
                route_id VARCHAR(20) NOT NULL,
                data JSONB NOT NULL,
                cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (service_date, metric, threshold_minutes, include_canceled, frequency_filter, route_id)
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_cache_on_time_daily_date ON cache_on_time_daily(service_date)`;

        cacheTableInitialized = true;
    } catch (error) {
        console.error('Error ensuring cache tables exist:', error);
        throw error;
    }
}

export function isCurrentServiceDay(date: Date): boolean {
    const todayServiceDay = getDateFromTimestamp(new Date());
    return toDateString(date) === toDateString(todayServiceDay);
}

export async function getCachedDailyStats(
    serviceDate: Date,
    metric: string,
    thresholdMinutes: number,
    includeCanceled: boolean,
    frequencyFilter: string | null,
    routeId: string | null
): Promise<CachedAggregates | null> {
    await ensureCacheTableExists();

    const dateStr = toDateString(serviceDate);
    const filterStr = frequencyFilter || '';
    const idStr = routeId || '';

    try {
        const result = await sql<{ data: CachedAggregates }[]>`
            SELECT data FROM cache_on_time_daily
            WHERE service_date = ${dateStr}::date
              AND metric = ${metric}
              AND threshold_minutes = ${thresholdMinutes}
              AND include_canceled = ${includeCanceled}
              AND frequency_filter = ${filterStr}
              AND route_id = ${idStr}
            LIMIT 1
        `;

        if (result.length > 0) return result[0].data;
        return null;
    } catch (error) {
        console.error('Error fetching daily cache:', error);
        return null;
    }
}

export async function setCachedDailyStats(
    serviceDate: Date,
    metric: string,
    thresholdMinutes: number,
    includeCanceled: boolean,
    frequencyFilter: string | null,
    routeId: string | null,
    data: CachedAggregates
): Promise<void> {
    await ensureCacheTableExists();
    const dateStr = toDateString(serviceDate);
    const filterStr = frequencyFilter || '';
    const idStr = routeId || '';

    try {
        await sql`
            INSERT INTO cache_on_time_daily
            (service_date, metric, threshold_minutes, include_canceled, frequency_filter, route_id, data, cached_at)
            VALUES
            (${dateStr}::date, ${metric}, ${thresholdMinutes}, ${includeCanceled}, ${filterStr}, ${idStr}, ${sql.json(data)}, NOW())
            ON CONFLICT (service_date, metric, threshold_minutes, include_canceled, frequency_filter, route_id)
            DO UPDATE SET data = EXCLUDED.data, cached_at = NOW()
        `;
    } catch (error) {
        console.error('Error writing daily cache:', error);
    }
}

/**
 * Clear cache for a specific date range
 */
export async function invalidateCacheForDateRange(startDate: Date, endDate: Date): Promise<void> {
    await ensureCacheTableExists();
    const startDateStr = toDateString(startDate);
    const endDateStr = toDateString(endDate);

    try {
        await sql`
            DELETE FROM cache_on_time_daily
            WHERE service_date >= ${startDateStr}::date
              AND service_date <= ${endDateStr}::date
        `;
    } catch (error) {
        console.error('Error invalidating cache:', error);
    }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
    totalEntries: number;
    datesWithCache: number;
    oldestCachedDate: string | null;
    newestCachedDate: string | null;
    cacheSize: string;
}> {
    await ensureCacheTableExists();
    try {
        const stats = await sql<any[]>`
            SELECT 
                COUNT(*) as total_entries,
                COUNT(DISTINCT service_date) as dates_with_cache,
                MIN(service_date) as oldest_cached_date,
                MAX(service_date) as newest_cached_date,
                pg_size_pretty(pg_total_relation_size('cache_on_time_daily')) as cache_size
            FROM cache_on_time_daily
        `;
        
        if (stats.length > 0) {
            return {
                totalEntries: parseInt(stats[0].total_entries),
                datesWithCache: parseInt(stats[0].dates_with_cache),
                oldestCachedDate: stats[0].oldest_cached_date?.toString() || null,
                newestCachedDate: stats[0].newest_cached_date?.toString() || null,
                cacheSize: stats[0].cache_size
            };
        }
        return {
            totalEntries: 0,
            datesWithCache: 0,
            oldestCachedDate: null,
            newestCachedDate: null,
            cacheSize: '0 bytes'
        };
    } catch (error) {
        console.error('Error getting cache stats:', error);
        throw error;
    }
}
