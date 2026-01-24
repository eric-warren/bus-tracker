import sql from './database.ts';
import { toDateString } from './schedule.ts';

export interface OnTimePerformanceResponse {
    date: string;
    endDate: string;
    metric: string;
    thresholdMinutes: number;
    includeCanceled: boolean;
    frequencyFilter?: string | null;
    overall: any;
    routeSummary: any;
    routes: any[];
    routesCombined: any[];
    timeOfDay: any[];
    routeTimeOfDay: any[] | null;
}

// Initialize cache table on module load
let cacheTableInitialized = false;

export async function ensureCacheTableExists(): Promise<void> {
    if (cacheTableInitialized) return;
    
    try {
        // Drop existing table if it exists (to ensure correct schema)
        await sql`DROP TABLE IF EXISTS cache_on_time_performance CASCADE`;
        
        // Create table with composite primary key using empty strings for NULL values
        await sql`
            CREATE TABLE cache_on_time_performance (
                date DATE NOT NULL,
                metric VARCHAR(20) NOT NULL,
                threshold_minutes INT NOT NULL,
                include_canceled BOOLEAN NOT NULL,
                frequency_filter VARCHAR(20) NOT NULL DEFAULT '',
                route_id VARCHAR(10) NOT NULL DEFAULT '',
                data JSONB NOT NULL,
                cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (date, metric, threshold_minutes, include_canceled, frequency_filter, route_id)
            )
        `;
        
        // Create index separately
        await sql`CREATE INDEX idx_cache_date ON cache_on_time_performance(date)`;
        cacheTableInitialized = true;
    } catch (error) {
        console.error('Error creating cache table:', error);
    }
}

/**
 * Check if the given date is the current service day
 * Service day runs from 3 AM to 3 AM the next day
 */
export function isCurrentServiceDay(date: Date): boolean {
    const today = new Date();
    const todayServiceDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // If before 3 AM, today's data belongs to yesterday's service
    if (today.getHours() < 3) {
        todayServiceDate.setDate(todayServiceDate.getDate() - 1);
    }
    
    return date.getTime() === todayServiceDate.getTime();
}

/**
 * Generate a cache key from query parameters
 */
export function generateCacheKey(
    date: Date,
    metric: string,
    thresholdMinutes: number,
    includeCanceled: boolean,
    frequencyFilter: string | null,
    routeId: string | null
): string {
    return `${toDateString(date)}|${metric}|${thresholdMinutes}|${includeCanceled}|${frequencyFilter || 'null'}|${routeId || 'null'}`;
}

/**
 * Get cached statistics from database
 * Returns null if not found
 */
export async function getCachedStats(
    date: Date,
    metric: string,
    thresholdMinutes: number,
    includeCanceled: boolean,
    frequencyFilter: string | null,
    routeId: string | null
): Promise<OnTimePerformanceResponse | null> {
    await ensureCacheTableExists();
    const dateStr = toDateString(date);
    // Use empty string for NULL values in composite key
    const filterStr = frequencyFilter || '';
    const idStr = routeId || '';
    
    try {
        const result = await sql<{ data: OnTimePerformanceResponse }[]>`
            SELECT data FROM cache_on_time_performance
            WHERE date = ${dateStr}::date
              AND metric = ${metric}
              AND threshold_minutes = ${thresholdMinutes}
              AND include_canceled = ${includeCanceled}
              AND frequency_filter = ${filterStr}
              AND route_id = ${idStr}
            LIMIT 1
        `;
        
        if (result.length > 0) {
            return result[0].data;
        }
        return null;
    } catch (error) {
        console.error('Error fetching from cache:', error);
        return null;
    }
}

/**
 * Store statistics in cache
 */
export async function setCachedStats(
    date: Date,
    metric: string,
    thresholdMinutes: number,
    includeCanceled: boolean,
    frequencyFilter: string | null,
    routeId: string | null,
    data: OnTimePerformanceResponse
): Promise<void> {
    await ensureCacheTableExists();
    const dateStr = toDateString(date);
    // Use empty string for NULL values in composite key
    const filterStr = frequencyFilter || '';
    const idStr = routeId || '';
    
    try {
        await sql`
            INSERT INTO cache_on_time_performance 
            (date, metric, threshold_minutes, include_canceled, frequency_filter, route_id, data, cached_at)
            VALUES 
            (${dateStr}::date, ${metric}, ${thresholdMinutes}, ${includeCanceled}, ${filterStr}, ${idStr}, ${sql.json(data)}, NOW())
            ON CONFLICT (date, metric, threshold_minutes, include_canceled, frequency_filter, route_id)
            DO UPDATE SET data = EXCLUDED.data, cached_at = NOW()
        `;
    } catch (error) {
        console.error('Error writing to cache:', error);
        // Don't throw - caching failure should not break the API
    }
}

/**
 * Clear cache for a specific date range
 */
export async function invalidateCacheForDateRange(startDate: Date, endDate: Date): Promise<void> {
    const startDateStr = toDateString(startDate);
    const endDateStr = toDateString(endDate);
    
    try {
        await sql`
            DELETE FROM cache_on_time_performance
            WHERE date >= ${startDateStr}::date AND date <= ${endDateStr}::date
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
                COUNT(DISTINCT date) as dates_with_cache,
                MIN(date) as oldest_cached_date,
                MAX(date) as newest_cached_date,
                pg_size_pretty(pg_total_relation_size('cache_on_time_performance')) as cache_size
            FROM cache_on_time_performance
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
