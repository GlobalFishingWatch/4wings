const tilebelt = require('@mapbox/tilebelt');

export function boundsFromTile(z, x, y) {
  const [w, s, e, n] = tilebelt.tileToBBOX([x, y, z]);

  return {
    minLat: s,
    maxLat: n,
    minLon: w,
    maxLon: e,
  };
}

export function getLatLonFromCell(bound, cell, numCells) {
  const deltaLat = Math.abs((bound.maxLat - bound.minLat) / numCells);
  const deltaLon = Math.abs((bound.maxLon - bound.minLon) / numCells);
  const x = cell % numCells;
  const y = Math.floor(cell / numCells);
  return {
    lat: bound.maxLat - y * deltaLat,
    lon: bound.minLon + x * deltaLon,
  };
}

export function tile2Num(z, x, y) {
  return x + y * Math.pow(2, z);
}

export function getPoint(cell, x, y, zoom, numCellsLat, numCellsLon) {
  const bounds = boundsFromTile(zoom, x, y);

  const x1 = cell % numCellsLon;
  const y1 = Math.floor(cell / numCellsLon);

  const deltaLat = (bounds.maxLat - bounds.minLat) / numCellsLat;
  const deltaLon = (bounds.maxLon - bounds.minLon) / numCellsLon;
  let lat = bounds.minLat + y1 * deltaLat;
  let lon = bounds.minLon + x1 * deltaLon;

  return { lat, lon };
}

export function getCellDiffProj(cell, origNumCells, newNumCells) {
  if (origNumCells === newNumCells) {
    return cell;
  }
  let difference = origNumCells / newNumCells;

  const x1 = cell % origNumCells;
  const y1 = Math.floor(cell / origNumCells);

  const x2 = Math.floor(x1 / difference);
  const y2 = Math.floor(y1 / difference);
  return y2 * newNumCells + x2;
}
