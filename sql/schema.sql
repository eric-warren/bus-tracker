CREATE TABLE IF NOT EXISTS blocks (
    gtfs_version NUMERIC,
    route_id TEXT,
    service_id TEXT,
    trip_id TEXT,
    trip_headsign TEXT,
    route_direction INT,
    block_id TEXT,
    shape_id TEXT,
    start_time INTERVAL,
    end_time INTERVAL,
    PRIMARY KEY (gtfs_version, trip_id)
);

CREATE TABLE IF NOT EXISTS gtfs_versions (
    version NUMERIC PRIMARY KEY,
    import_date DATE
);

CREATE TABLE IF NOT EXISTS vehicles (
    time TIMESTAMP,
    id TEXT,
    trip_id TEXT,
    trip_start_time INTERVAL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    recorded_timestamp TIMESTAMP,
    PRIMARY KEY (time, id)
);

CREATE TABLE IF NOT EXISTS block_data (
    date DATE,
    trip_id TEXT,
    bus_id TEXT,
    block_id TEXT,
    route_id TEXT,
    route_direction INT,
    start_time INTERVAL,
    PRIMARY KEY (date, trip_id)
);
