import { tileToBBOX } from '@mapbox/tilebelt';

const dayInMS = 24 * 60 * 60 * 1000;

function clip(n, minValue, maxValue) {
  return Math.min(Math.max(n, minValue), maxValue);
}

function checkMaxMin(data) {
  const MIN_LAT = -85.051128;
  const MAX_LAT = 85.051128;
  const MIN_LON = -180;
  const MAX_LON = 180;
  data.lon = clip(data.lon, MIN_LON, MAX_LON);
  data.lat = clip(data.lat, MIN_LAT, MAX_LAT);
  if (data.lon === 0) {
    data.lon = 0.00000001;
  }
  if (data.lat === 0) {
    data.lat = 0.00000001;
  }
  return data;
}

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function lat2tile(lat, zoom) {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom),
  );
}

function getTileNums(lon, lat, maxZoom) {
  const nums = [];
  for (let i = 0; i <= maxZoom; i++) {
    const x = lon2tile(lon, i);
    const y = lat2tile(lat, i);
    nums.push(x + y * Math.pow(2, i));
  }

  return nums;
}

function boundsFromTile(z, x, y) {
  const [w, s, e, n] = tileToBBOX([x, y, z]);

  return {
    minLat: s,
    maxLat: n,
    minLon: w,
    maxLon: e,
  };
}

function getCell(cellsByZoom, lat, lon, zoom) {
  const cellSizeLat = cellsByZoom[zoom];
  const cellSizeLon = cellsByZoom[zoom];

  const x = lon2tile(lon, zoom);
  const y = lat2tile(lat, zoom);

  const bounds = boundsFromTile(zoom, x, y);
  const numCellsLat = Math.ceil((bounds.maxLat - bounds.minLat) / cellSizeLat);
  const numCellsLon = Math.ceil((bounds.maxLon - bounds.minLon) / cellSizeLon);

  const deltaLat = (bounds.maxLat - bounds.minLat) / numCellsLat;
  const deltaLon = (bounds.maxLon - bounds.minLon) / numCellsLon;
  const y1 = Math.floor((lat - bounds.minLat) / deltaLat);
  const x1 = Math.floor((lon - bounds.minLon) / deltaLon);
  return x1 + y1 * numCellsLon;
}

function getCells(maxZoom, cellsByZoom, lon, lat) {
  const cells = [];
  for (let i = 0; i <= maxZoom; i++) {
    cells.push(getCell(cellsByZoom, lat, lon, i));
  }
  return cells;
}

export function parseElement(options: any, origData: any): any[] {
  const data = checkMaxMin(origData);

  if (options.heatmap) {
    const time = options.heatmap.time ? options.heatmap.time * 1000 : dayInMS;
    let dateTrunc = new Date(data.timestamp / 1000);
    dateTrunc = new Date(dateTrunc.getTime() - (dateTrunc.getTime() % time));
    data.htime = Math.floor(dateTrunc.getTime() / time);
    data.timestamp = new Date(data.timestamp / 1000).toISOString();
  }

  const nums = getTileNums(data.lon, data.lat, options.maxZoom);

  const cells = getCells(
    options.maxZoom,
    options.cellsByZoom,
    data.lon,
    data.lat,
  );

  const result = [];
  for (let i = 0; i <= options.maxZoom; i++) {
    const el: any = {
      lat: data.lat,
      lon: data.lon,
      pos: nums[i],
      cell: cells[i],
      timestamp: data.timestamp,
      zoom: i,
    };
    if (options.heatmap) {
      el.htime = data.htime;
    }
    options.extraColumns.forEach((k) => {
      el[k] = data[k];
    });

    result.push(el);
  }

  return result;
}
