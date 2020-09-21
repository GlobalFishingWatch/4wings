import { tile2Num, boundsFromTile, getPoint } from 'common/geo-utils';
import * as GeoJSON from 'geojson';
import * as vtpbf from 'vt-pbf';
import * as geojsonVt from 'geojson-vt';
import { generateCustomPBF } from './custom-pbf.service';
import { logger } from 'logger';
import * as zlib from 'zlib';

export class TileService {
  static async zip(buff) {
    return await new Promise((resolve, reject) => {
      zlib.gzip(buff, (err, data) => {
        if (err) {
          logger.error('Error zipping response');
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }

  static getPosByCoords(coords) {
    return tile2Num(coords.z, coords.x, coords.y);
  }

  static async generateQuery(
    coords,
    datasetGroups,
    typeTile,
    filters: any[] = null,
    temporalAggregation = false,
    interval?,
  ) {
    // static async generateQuery(ctx: Koa.ParameterizedContext) {
    const pos = tile2Num(coords.z, coords.x, coords.y);

    return datasetGroups.map((group, index) => {
      const query = group
        .map((dataset) => {
          console.log(filters[index]);
          let query = '';
          let htimeColumn = 'htime';
          if (interval && dataset.heatmap.time !== interval) {
            htimeColumn = `FLOOR(htime * ${dataset.heatmap.time} / ${interval}) as htime`;
          }
          const type = dataset[typeTile];
          if (typeTile === 'heatmap') {
            query = `
            select cell ${!temporalAggregation ? `,${htimeColumn}` : ''}
            ${
              type.columns.length > 0
                ? `,${type.columns
                    .map((h) => `${h.func}(${h.column}) as ${h.alias}`)
                    .join(',')}`
                : ''
            }
            from ${dataset.name}_z${coords.z}
            where pos = ${parseInt(pos, 10)}
            ${filters && filters[index] ? `and ${filters[index]}` : ''}
            group by 1${!temporalAggregation ? ',2' : ''}`;
          } else {
            query = `
            select htime, lat, lon ${
              type.columns ? `, ${type.columns.join(',')}` : ''
            }
            from ${dataset.name}_z${coords.z}
            where pos = ${parseInt(pos, 10)}
            ${filters && filters[index] ? `and ${filters[index]}` : ''}`;
          }
          return query;
        })
        .join(' union all ');
      return query;
    });
  }

  static getCellByDatasetRowAndColumn(dataset, coords, cellColumn, cellRow) {
    let cellsByZoom = dataset.cellsByZoom;
    const bounds = boundsFromTile(coords.z, coords.x, coords.y);

    // cellsByZoom = cellsByZoom.map((v) => Math.sqrt(v) / 111320);

    const cellSizeLon = Math.sqrt(cellsByZoom[coords.z]) / 111320;

    const numCellsLon = Math.ceil(
      (bounds.maxLon - bounds.minLon) / cellSizeLon,
    );

    return numCellsLon * cellRow + cellColumn;
  }

  static async generateHeatmapTile(
    groups: any[],
    coords,
    data,
    ctxState,
    format,
    interval = null,
  ) {
    let cellsByZoom = groups[0][0].cellsByZoom;
    const bounds = boundsFromTile(coords.z, coords.x, coords.y);

    cellsByZoom = cellsByZoom.map((v) => Math.sqrt(v) / 111320);

    const cellSizeLat = cellsByZoom[coords.z];
    const cellSizeLon = cellsByZoom[coords.z];
    const numCellsLat = Math.ceil(
      (bounds.maxLat - bounds.minLat) / cellSizeLat,
    );
    const numCellsLon = Math.ceil(
      (bounds.maxLon - bounds.minLon) / cellSizeLon,
    );
    const deltaLat = (bounds.maxLat - bounds.minLat) / numCellsLat;
    const deltaLon = (bounds.maxLon - bounds.minLon) / numCellsLon;

    let results = new Array(numCellsLat * numCellsLon);

    data.forEach((d, index) => {
      // let originalInterval = datasets[index].heatmap.time;
      d.rows.forEach((row) => {
        const cell = row.cell;
        if (!results[cell]) {
          const { lat, lon } = getPoint(
            cell,
            coords.x,
            coords.y,
            coords.z,
            numCellsLat,
            numCellsLon,
          );

          results[cell] = {
            lat,
            lon,
            cell,
          };
        }
        if (!isNaN(row.count)) {
          row.count = parseFloat(row.count);
        }
        let rowHtime = row.htime;
        // if (interval) {
        //   rowHtime = Math.floor((rowHtime * originalInterval) / interval);
        // }
        if (!ctxState.temporalAggregation) {
          if (!results[cell][rowHtime]) {
            if (data.length > 1) {
              results[cell][rowHtime] = new Array(data.length).fill(0);
            } else {
              results[cell][rowHtime] = 0;
            }
          }

          if (data.length > 1) {
            results[cell][rowHtime][index] += row.count * 100;
          } else {
            results[cell][rowHtime] += row.count * 100;
            if (ctxState.mode) {
              results[cell][`${rowHtime}_${ctxState.mode}`] =
                row[`mode_${ctxState.mode}`];
            }
          }
        } else {
          if (!results[cell].value) {
            if (data.length > 1) {
              results[cell].value = new Array(data.length).fill(0);
            } else {
              results[cell].value = 0;
            }
          }
          if (data.length > 1) {
            results[cell].value[index] += row.count * 100;
          } else {
            results[cell].value += row.count * 100;
            if (ctxState.mode) {
              results[cell].value[`${ctxState.mode}`] =
                row[`mode_${ctxState.mode}`];
            }
          }
        }
      });
    });

    if (format === 'intArray') {
      return await generateCustomPBF(
        groups,
        ctxState,
        results,
        numCellsLat,
        numCellsLon,
      );
    } else {
      results = results.map((r) => {
        r.polygon = [
          [
            [r.lon, r.lat],
            [r.lon + deltaLon, r.lat],
            [r.lon + deltaLon, r.lat + deltaLat],
            [r.lon, r.lat + deltaLat],
            [r.lon, r.lat],
          ],
        ];

        return r;
      });
      const geojson = GeoJSON.parse(results, { Polygon: 'polygon' });
      const tileindex = geojsonVt(geojson, {
        indexMaxPoints: 512 * 512,
        // extent: numCells * numCells,
      });
      const tile = tileindex.getTile(coords.z, coords.x, coords.y);
      if (!tile) {
        // console.log('no tile');
        return;
      }

      return vtpbf.fromGeojsonVt({ main: tile }, { version: 2 });
    }
  }

  static generatePositionTile(results: any[], dataset: any, coords) {
    const geojson = GeoJSON.parse(results, { Point: ['lat', 'lon'] });

    const tileindex = geojsonVt(geojson, {
      indexMaxPoints: 512 * 512,
    });
    const tile = tileindex.getTile(coords.z, coords.x, coords.y);
    if (!tile) {
      return;
    }
    return vtpbf.fromGeojsonVt({ [dataset.name]: tile }, { version: 2 });
  }
}
