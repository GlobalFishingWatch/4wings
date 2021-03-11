import * as Router from '@koa/router';
import * as Koa from 'koa';
import { Pool } from 'pg';
import { logger } from 'logger';
import { existDataset as existDatasetV1 } from 'tile-server/middlewares/exist-dataset-v1.middleware';
import { existType } from 'tile-server/middlewares/exist-type.middleware';
import { cache as cacheV1 } from 'tile-server/middlewares/cache-v1.middleware';
import * as zlib from 'zlib';
import { TileService } from 'common/services/tile.service';
import { addDateRange } from 'tile-server/middlewares/date-range.middleware';
import { checkPermissions } from 'tile-server/middlewares/check-permissions.middleware';
import * as authMiddleware from 'auth-middleware';

const router = new Router({
  prefix: '/v1',
});

const pools = {};

async function getClientByDataset(dataset) {
  if (!pools[dataset.name]) {
    logger.debug(`New pool for ${dataset.name}`);
    const connection: any = {
      user: dataset.target.database.user,
      database: dataset.target.database.database,
      password: dataset.target.database.password,
      max: 40,
    };
    if (process.env.NODE_ENV === 'dev') {
      connection.host = 'localhost';
    } else if (dataset.target.type === 'cloudsql') {
      connection.host = `/cloudsql/${dataset.target.database.projectId}:${
        dataset.target.database.region
          ? dataset.target.database.region
          : 'us-central1'
      }:${dataset.target.database.instanceId}`;
    } else {
      connection.host = dataset.target.database.host;
    }
    if (dataset.target.database.port && process.env.NODE_ENV === 'dev') {
      connection.port = dataset.target.database.port;
    }
    pools[dataset.name] = new Pool(connection);
  }

  return await pools[dataset.name].connect();
}

class MVTRouter {
  static async getStatisticsByZoom(
    ctx: Koa.ParameterizedContext,
    zoom: number,
  ) {
    const queries = ctx.state.datasetGroups.map(async (group, i) => {
      const datasetsQuery = group.map((d) => {
        const type = d.heatmap;
        const statisticsQuery = `
          select 
            max(sub.count) as max, 
            min(sub.count) as min, 
            avg(sub.count) as avg
          from (
          select ${type.columns
            .filter((h) => h.alias === 'count')
            .map((h) => `${h.func}(${h.column}) as count`)
            .join(',')}
          from "${d.name}_z${zoom}"
          ${
            ctx.state.filters && ctx.state.filters[i]
              ? `WHERE ${ctx.state.filters[i]}`
              : ''
          }
          group by pos, cell${
            !ctx.state.temporalAggregation ? ',htime' : ''
          }) sub
      `;
        return statisticsQuery;
      });

      const finalQuery = `
      with total as (${datasetsQuery.join(' union all ')})
      
      select 
        sum(max) as max, 
        sum(min) as min, 
        sum(avg) as avg
        from total  
      `;

      let client;
      try {
        client = await getClientByDataset(group[0]);
        const data = await client.query(finalQuery);
        if (!data || !data.rows || data.rows.length === 0) {
          console.log('Error obtaining statistics');
          return { name: group.map((d) => d.name).join(','), data: null };
        }
        Object.keys(data.rows[0]).forEach(
          (k) => (data.rows[0][k] = parseFloat(data.rows[0][k])),
        );
        return {
          name: group.map((d) => d.name).join(','),
          data: data.rows[0],
          startDate: group[0].startDate,
          endDate: group[0].endDate,
        };
      } catch (err) {
        logger.error('Error in statistics query', err);
        throw err;
      } finally {
        if (client) {
          client.release();
        }
      }
    });
    try {
      const data: any = await Promise.all(queries);
      if (data.every((d: any) => d.data === null)) {
        console.log('Error obtaining statistics');
        ctx.throw(404, 'Statistics not found');
      }
      if (data.length === 1) {
        const body = data[0].data;
        body.area = ctx.state.datasetGroups[0][0].cellsByZoom[zoom];
        body.startDate = ctx.state.datasetGroups[0][0].startDate;
        body.endDate = ctx.state.datasetGroups[0][0].endDate;

        return body;
      } else {
        const body: any = data.reduce((p: any, c: any) => {
          p[c.name] = c.data;
          return p;
        }, {});

        body.area = ctx.state.datasetGroups[0][0].cellsByZoom[zoom];
        return body;
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  static async getSamplingByZoom(ctx: Koa.ParameterizedContext, zoom: number) {
    const queries = ctx.state.datasetGroups.map(async (group, i) => {
      const datasetsQuery = group.map((d) => {
        const type = d.heatmap;
        const statisticsQuery = `          
          select ${type.columns
            .filter((h) => h.alias === 'count')
            .map((h) => `${h.func}(${h.column}) as count`)
            .join(',')}
          from "${d.name}_z${zoom}"
          ${
            ctx.state.filters && ctx.state.filters[i]
              ? `WHERE ${ctx.state.filters[i]}`
              : ''
          }
          group by pos, cell${!ctx.state.temporalAggregation ? ',htime' : ''}
      `;
        return statisticsQuery;
      });

      const finalQuery = datasetsQuery.join(' union all ');

      console.log(finalQuery);
      let client;
      try {
        client = await getClientByDataset(group[0]);
        const data = await client.query(finalQuery);
        if (!data || !data.rows || data.rows.length === 0) {
          console.log('Error obtaining statistics');
          return { name: group.map((d) => d.name).join(','), data: null };
        }
        Object.keys(data.rows[0]).forEach(
          (k) => (data.rows[0][k] = parseFloat(data.rows[0][k])),
        );
        return {
          name: group.map((d) => d.name).join(','),
          data: data.rows.map((r) => r.count),
        };
      } catch (err) {
        logger.error('Error in sampling query', err);
        throw err;
      } finally {
        if (client) {
          client.release();
        }
      }
    });
    try {
      const data: any = await Promise.all(queries);
      if (data.every((d: any) => d.data === null)) {
        console.log('Error obtaining sampling');
        ctx.throw(404, 'sampling not found');
      }
      ctx.body = data;
      if (data.length === 1) {
        const body = data[0].data;
        body.area = ctx.state.datasetGroups[0][0].cellsByZoom[zoom];
        body.startDate = ctx.state.datasetGroups[0][0].startDate;
        body.endDate = ctx.state.datasetGroups[0][0].endDate;

        return body;
      } else {
        const body: any = data.reduce((p: any, c: any) => {
          p[c.name] = c.data;
          return p;
        }, {});

        body.area = ctx.state.datasetGroups[0][0].cellsByZoom[zoom];
        return body;
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  static async getStatistics(ctx: Koa.ParameterizedContext) {
    if (ctx.params.z) {
      ctx.body = await MVTRouter.getStatisticsByZoom(
        ctx,
        parseInt(ctx.params.z, 10),
      );
    } else {
      const promises = [];
      for (let i = 0; i <= ctx.state.datasetGroups[0][0].maxZoom; i++) {
        const zoom = i;
        promises.push(
          MVTRouter.getStatisticsByZoom(ctx, i).then((data) => {
            data.zoom = zoom;
            return data;
          }),
        );
      }
      ctx.body = await Promise.all(promises);
    }
  }
  static async getInteraction(ctx: Koa.ParameterizedContext) {
    const coords = {
      z: parseInt(ctx.params.z, 10),
      x: parseInt(ctx.params.x, 10),
      y: parseInt(ctx.params.y, 10),
    };
    const pos = TileService.getPosByCoords(coords);
    const rows = ctx.params.cellRow.split(',');
    const cells = ctx.params.cellColumn.split(',').map((column, index) => {
      return TileService.getCellByDatasetRowAndColumn(
        ctx.state.datasetGroups[0][0],
        coords,
        parseInt(column, 10),
        parseInt(rows[index]),
      );
    });
    let queries = [];
    ctx.state.datasetGroups.forEach(async (group, i) => {
      const groupQueries = group.map(async (d) => {
        console.log(d);
        const query = `
          select vessel_id as id, 
          ${d.heatmap.columns[0].func}(${d.heatmap.columns[0].column}) as hours
          
          from "${d.name}_z${ctx.params.z}"
          where pos = ${pos} and (${cells
          .map((cell) => `cell = ${cell}`)
          .join(' or ')})
          ${
            ctx.state.filters && ctx.state.filters[i]
              ? `AND ${ctx.state.filters[i]}`
              : ''
          } group by 1 order by hours desc ${
          ctx.query.limit ? ` limit ${parseInt(ctx.query.limit as string)}` : ''
        }     
        `;
        console.log(query);
        let client;
        try {
          client = await getClientByDataset(d);
          const data = await client.query(query);
          if (!data || !data.rows || data.rows.length === 0) {
            console.log('Error obtaining statistics');
            return [];
          }

          return data.rows;
        } catch (err) {
          logger.error('Error in statistics query', err);
          throw err;
        } finally {
          if (client) {
            client.release();
          }
        }
      });
      queries = queries.concat(groupQueries);
    });
    try {
      const data: any = await Promise.all(queries);
      ctx.body = data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  static async getSampling(ctx: Koa.ParameterizedContext) {
    if (ctx.params.z) {
      ctx.body = await MVTRouter.getSamplingByZoom(
        ctx,
        parseInt(ctx.params.z, 10),
      );
    } else {
      const promises = [];
      for (let i = 0; i <= ctx.state.dataset[0].maxZoom; i++) {
        const zoom = i;
        promises.push(
          MVTRouter.getSamplingByZoom(ctx, i).then((data) => {
            data.zoom = zoom;
            return data;
          }),
        );
      }
      ctx.body = await Promise.all(promises);
    }
  }

  static async getTile(ctx: Koa.ParameterizedContext) {
    console.log('Getting tile');
    const coords = {
      z: parseInt(ctx.params.z, 10),
      x: parseInt(ctx.params.x, 10),
      y: parseInt(ctx.params.y, 10),
    };

    const query = await TileService.generateQuery(
      coords,
      ctx.state.datasetGroups,
      ctx.params.type,
      Array.isArray(ctx.state.filters)
        ? ctx.state.filters
        : [ctx.query.filters],
      ctx.state.temporalAggregation,
      ctx.state.interval,
    );
    console.log(query);

    const promises = ctx.state.datasetGroups.map(async (group, i) => {
      let client;
      try {
        client = await getClientByDataset(group[0]);
        const data = await client.query(query[i]);
        return data;
      } catch (err) {
        console.error('Error', err);
        throw err;
      } finally {
        if (client) {
          client.release();
        }
      }
    });
    let start = Date.now();
    const data: any = await Promise.all(promises);
    if (data.every((d: any) => !d.rows || d.rows.length === 0)) {
      ctx.throw(404, 'Tile empty');
    }
    logger.debug('BBDD ' + (Date.now() - start));
    let buff = null;

    if (ctx.params.type === 'heatmap') {
      logger.debug('Heatmap tile');
      const start = Date.now();
      buff = await TileService.generateHeatmapTile(
        ctx.state.datasetGroups,
        coords,
        data,
        ctx.state,
        ctx.query.format,
        ctx.state.interval,
      );
      logger.debug('Generate tile ' + (Date.now() - start));
      ctx.set(
        'datasets',
        ctx.state.datasetGroups
          .map((g) => g.map((d) => d.name).join(','))
          .join(';'),
      );
    } else {
      logger.debug('Position tile');
      buff = await TileService.generatePositionTile(
        data[0].rows,
        ctx.state.datasetGroups[0][0],
        coords,
      );
    }

    if (ctx.query.format !== 'intArray') {
      ctx.compress = true;
      ctx.set('content-type', 'application/vnd.mapbox-vector-tile');
      ctx.body = Buffer.from(new Uint8Array(buff));
    } else {
      ctx.compress = false;
      ctx.set('columns', 'count');

      const compressed = await new Promise((resolve, reject) => {
        zlib.gzip(buff, (err, data) => {
          if (err) {
            logger.error('Error zipping response');
            reject(err);
            return;
          }
          resolve(data);
        });
      });
      ctx.set('Content-Encoding', 'gzip');
      ctx.set('content-type', 'application/vnd.mapbox-vector-tile');
      ctx.body = compressed;
    }
  }
}

router.get(
  '/tile/:type/:z/:x/:y',
  authMiddleware.koa.obtainPermissions(),
  checkPermissions,
  existDatasetV1,
  existType,
  cacheV1,
  addDateRange,
  MVTRouter.getTile,
);

router.get(
  '/legend/:z',
  authMiddleware.koa.obtainPermissions(),
  checkPermissions,
  existDatasetV1,
  addDateRange,
  MVTRouter.getStatistics,
);
router.get(
  '/legend',
  authMiddleware.koa.obtainPermissions(),
  checkPermissions,
  existDatasetV1,
  addDateRange,
  MVTRouter.getStatistics,
);

router.get(
  '/sampling/:z',
  authMiddleware.koa.obtainPermissions(),
  checkPermissions,
  existDatasetV1,
  addDateRange,
  MVTRouter.getSampling,
);
router.get(
  '/sampling',
  authMiddleware.koa.obtainPermissions(),
  checkPermissions,
  existDatasetV1,
  addDateRange,
  MVTRouter.getSampling,
);

router.get(
  '/interaction/:z/:x/:y/:cellColumn/:cellRow',
  authMiddleware.koa.obtainPermissions(),
  checkPermissions,
  existDatasetV1,
  addDateRange,
  MVTRouter.getInteraction,
);

export default router;
