import { importGtfs } from "./utils/gtfsImport.ts"

const date = process.argv[3] ? new Date(process.argv[3]) : null;
if (process.argv.length !== 4 || typeof process.argv[2] !== 'string' || !date || isNaN(date.getTime())) {
    console.error("Usage: <path to GTFS folder> <import date YYYY-MM-DD>");
    process.exit(1);
}

await importGtfs(process.argv[2], date);
process.exit(0);