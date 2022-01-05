# 4wings

4wings is the name of <a href="https://globalfishingwatch.org/">GlobalFishingWatch's</a> strategy to present big **spatiotemporal datasets**.

GFW's datasets can be very large (mapping about 65000 fishing vessels activity with tracks in the 100 000s of points), and they need to be explorable by the user in an efficient manner. This creates a number of challenges, from ingestion, to tile caching, efficient rendering and animation, etc.

The objective is to show fishing activity around the globe considering:

- Performance: fast API response times, caching, no UI lock, GPU rendering
- Precision: from yearly to hourly view, from world view to city-scale (z level 12)
- Completeness: XYZ coords, time properties, as well as any useful metadata: fishing activity, fishing events (encounters at sea, etc), flags, gear types, etc from multiples vessel activity sources of data (AIS, VMS, SAR, etc), and other datasets (sea temp., bathymetry, salinity, animal telemetry, etc)

The data model consists in presenting spatiotemporal dataset in a gridded format:

- which resolution per tile can vary depending on the part of the world (to maintain a stable cell real coverage at a given zoom level) and the zoom level (resolution gets higher at higher zoom levels as a less dense grid allows it)
- where each cell contains data for a given span of time, in a time resolution variable depending on the tile time span
- presentend by the API as Protobuffers containing an integer array 
- converted on the fly by a custom MapLibre GL Source implementation to an MVT tile
- optionally aggregated on the fly for animation purposes
- rendered by the GPU

The **client-side** aspect of 4wings consists of:

- a custom fork of <a href="https://github.com/GlobalFishingWatch/maplibre-gl-js/pull/1">MapLibre GL JS</a>
- <a href="https://github.com/GlobalFishingWatch/frontend/tree/develop/libs/layer-composer">layer-composer</a>, a tool to prepare a MapLibre GL JSON style</a> 

This repository contains the **back-end components** of 4wings, made of 3 apps:

- Importer: Import the data, convert and write in a database. [More info](./src/importer/README.md)
- Tile Server: Generate and serve the tiles in real time. [More info](./src/tile-server/README.md)
- Generate tiles: Process to pregenerate the tiles. [More info](./src/generate-tiles/README.md)

## Execution

Install dependencies:

```
npm install
```

Run:

```
npm run start <command>
```

### Commands available:

- tile-server: Run tile server.

  Required environment variables:

  - DB_USER: Database user
  - DB_PASS: Database password
  - DB_HOST: Database host
  - DB_NAME: Database name
  - DB_PORT: Database port

- generate-tiles: Run generate tiles of dataset

  Required arguments:

  - --url=<Url of the config file>
  - --date=<Date to execute>

  Optional arguments:

  - --token=<Auth token to obtain the config file> (optional)

- import: Import data in dataset.

  Required arguments:

  - --url=<Url of the config file>
  - --date=<Date to execute>
  - --period=<Period to import the data (daily, monthly, yearly)>

  Optional arguments:

  - --token=<Auth token to obtain the config file> (optional)

### Configuration file

Before you run the process, you need to generate a config file with the configuration of your dataset and

- name: Is the name of your project. Required field. Only use: [a-zA-Z_] characters.
- maxZoom: Maximum level of zoom that fast tiles will generate for your data. Required field. Number.
- extraColumns: AArray with the keys/columns of the objects sended by the reader that we want to include in the final objects. Required field.
- searchColumns: Array of keys/column names that will be included in the index to enable filter by those columns in the generation tiles api. The name of the column, will be the name of the query param in the tile request. Required field.
- cellsByZoom: Array with the size in square meters that each cell should have for each level of zoom (0 to maxZoom). Required field.
- position: Object with the configuration of the position tiles. If this key is provided, the process will generate the position tiles. In other case, the position tiles won't be generated
  - columns: Array of column names of the extra columns to add in the position tiles.
  - cache: True if you want that the `generate-tiles` process pre-cache the heatmap tiles. False in other case. Default false.
  - fromLevelCache: Minimum level of zoom to generate the cache of the heatmap tiles. Number.
  - toLevelCache: Maximum level of zoom to generate the cache of the heatmap tiles. Number.
- heatmap: Object with the configuration of the heatmap tiles. If this key is provided, the process will generate the heatmap tiles. In other case, the heatmap tiles won't be generated.

  - time: Step size (in seconds) of the heatmap. Default 24h.
  - columns: Array of columns to generate the data to include in the heatmap tile. All fields are required.
    - column: Name of the column
    - func: Grouping function. Supported all function supported by Posgres.
    - alias: Name of the field in the tile.
  - temporalAggregation: True if you want that the heatmap tiles do not take time into account when aggregating data. In other words, the heatmap tiles don't contains time information. False in other case. Default false.
  - cache: True if you want that the `generate-tiles` process pre-cache the heatmap tiles. False in other case. Default false.
  - fromLevelCache: Minimum level of zoom to generate the cache of the heatmap tiles. Number.
  - toLevelCache: Maximum level of zoom to generate the cache of the heatmap tiles. Number.

- source: Object with the configuration of the reader. More info in each reader.
- target: Object with the configuration of the writer. More info in each writer.
- cache: Object with the configuration to the generate-tiles process. [More info](./generate-tiles/README.md)

Examples:

- Example of a configuration file. From BigQuery to CloudSQL (Postgres): [here](./doc/examples-config/bigquery-to-cloudsql.json)
