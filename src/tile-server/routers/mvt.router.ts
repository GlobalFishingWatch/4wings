import * as Router from '@koa/router';
import * as Koa from 'koa';
import { Pool } from 'pg';
import { logger } from 'logger';
import { existDataset } from 'tile-server/middlewares/exist-dataset.middleware';
import { existType } from 'tile-server/middlewares/exist-type.middleware';
import { cache } from 'tile-server/middlewares/cache.middleware';
import * as zlib from 'zlib';
import { TileService } from 'common/services/tile.service';

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
      connection.host = `/cloudsql/${dataset.target.database.projectId}:${dataset.target.database.region}:${dataset.target.database.instanceId}`;
    } else {
      connection.host = dataset.target.database.host;
    }
    if (dataset.target.database.port) {
      connection.port = dataset.target.database.port;
    }
    pools[dataset.name] = new Pool(connection);
  }
  
  return await pools[dataset.name].connect();;
}

class MVTRouter {
  static async getStatisticsByZoom(
    ctx: Koa.ParameterizedContext,
    zoom: number,
  ) {
    const queries = ctx.state.dataset.map(async (d) => {
      const type = d.heatmap;
      const statisticsQuery = `
      select max(sub.count) as max, min(sub.count) as min, avg(sub.count) as avg, percentile_cont(0.5) within group (order by sub.count) as median  from (select ${type.columns
        .filter((h) => h.alias === 'count')
        .map((h) => `count(${h.column}) as count`)
        .join(',')}
      from ${d.name}_z${zoom}
      ${ctx.query.filters ? `WHERE ${ctx.query.filters}` : ''}
      group by pos, cell${!ctx.state.temporalAggregation ? ',htime' : ''}) sub
      `;
      let client;
      try {
        client = await getClientByDataset(d);
        const data = await client.query(statisticsQuery);
        if (!data || !data.rows || data.rows.length === 0) {
          console.log('Error obtaining statistics');
          return { name: d.name, data: null };
        }
        Object.keys(data.rows[0]).forEach(
          (k) => (data.rows[0][k] = parseFloat(data.rows[0][k])),
        );
        return {
          name: d.name,
          data: data.rows[0],
          startDate: d.startDate,
          endDate: d.endDate,
        };
      } catch(err) {
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
        body.area = ctx.state.dataset[0].cellsByZoom[zoom];
        body.startDate = ctx.state.dataset[0].startDate;
        body.endDate = ctx.state.dataset[0].endDate;

        return body;
      } else {
        const body: any = data.reduce((p: any, c: any) => {
          p[c.name] = c.data;
          return p;
        }, {});

        body.area = ctx.state.dataset[0].cellsByZoom[zoom];
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
      for (let i = 0; i <= ctx.state.dataset[0].maxZoom; i++) {
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

  static async getTile(ctx: Koa.ParameterizedContext) {
    const coords = {
      z: parseInt(ctx.params.z, 10),
      x: parseInt(ctx.params.x, 10),
      y: parseInt(ctx.params.y, 10),
    };
    const query = await TileService.generateQuery(
      coords,
      ctx.state.dataset,
      ctx.params.type,
      ctx.query.filters,
      ctx.state.temporalAggregation,
      ctx.state.mode,
    );

    const promises = ctx.state.dataset.map(async (d, i) => {
      let client;
      try {
        client = await getClientByDataset(d);
        const data = await client.query(query[i]);
        return data;
      } catch(err){
        console.error('Error', err);
        throw err;
      } finally {
        if (client) {
          client.release();
        }
      }
    });
    const data: any = await Promise.all(promises);
    if (data.every((d: any) => !d.rows || d.rows.length === 0)) {
      ctx.throw(404, 'Tile empty');
    }
    let buff = null;

    if (ctx.params.type === 'heatmap') {
      logger.debug('Heatmap tile');
      buff = await TileService.generateHeatmapTile(
        ctx.state.dataset,
        coords,
        data,
        ctx.state,
        ctx.query.format,
      );
      ctx.set('datasets', ctx.state.dataset.map((d) => d.name).join(','));
    } else {
      logger.debug('Position tile');
      buff = await TileService.generatePositionTile(
        data[0].rows,
        ctx.state.dataset[0],
        coords,
      );
    }
    // console.log(buff);
    if (ctx.query.format !== 'intArray') {
      ctx.compress = true;
      ctx.set('content-type', 'application/vnd.mapbox-vector-tile');
      ctx.body = Buffer.from(new Uint8Array(buff));
    } else {
      ctx.compress = false;
      if (ctx.state.mode) {
        ctx.set('columns', `count,${ctx.state.mode}`);
      } else {
        ctx.set('columns', 'count');
      }
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
  '/:dataset/tile/:type/:z/:x/:y',
  existDataset,
  existType,
  cache,
  MVTRouter.getTile,
);

router.get('/:dataset/statistics/:z', existDataset, MVTRouter.getStatistics);
router.get('/:dataset/statistics', existDataset, MVTRouter.getStatistics);

export default router;
