import { fetchRealtime } from "./utils/fetchRealtime.ts";

const interval = 60 * 1000;

setInterval(() => {
    fetchRealtime();
}, interval);

fetchRealtime();