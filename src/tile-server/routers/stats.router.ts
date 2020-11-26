import * as Router from '@koa/router';
import * as Koa from 'koa';
import { Pool } from 'pg';
import { existDataset } from 'tile-server/middlewares/exist-dataset-v1.middleware';
import { logger } from 'logger';
import { addDateRange } from 'tile-server/middlewares/date-range.middleware';
import * as request from 'request';

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

class StatsRouter {
  static async getStats(ctx: Koa.ParameterizedContext) {
    const dataset = ctx.state.datasetGroups[0][0];
    if (dataset.name.toLowerCase().indexOf('fishing') >= 0) {
      let client;
      try {
        const queryMonth = `
          select sum(value) as total  from ${dataset.name}_z0
          ${
            ctx.state.filters && ctx.state.filters[0]
              ? `WHERE ${ctx.state.filters[0]}`
              : ''
          }
          group by timestamp
          order by timestamp asc
        `;
        const queryYearly = `
          select total from (select EXTRACT(YEAR FROM timestamp) as year, sum(value) as total from ${
            dataset.name
          }_z0
          ${
            ctx.state.filters && ctx.state.filters[0]
              ? `WHERE ${ctx.state.filters[0]}`
              : ''
          }
          group by EXTRACT(YEAR FROM timestamp)) s order by year asc
          
        `;
        client = await getClientByDataset(dataset);
        const dataMonth = await client.query(queryMonth);
        const dataYearly = await client.query(queryYearly);

        ctx.body = {
          monthly: dataMonth.rows.map((d) => d.total),
          yearly: dataYearly.rows.map((d) => d.total),
        };
      } catch (err) {
        logger.error('Error in stats query', err);
        throw err;
      } finally {
        if (client) {
          client.release();
        }
      }
    } else {
      const bucket = dataset.cache.bucket;
      const url = `${bucket.replace('gs://', '//storage.googleapis.com/')}${
        dataset.cache.dir ? `/${dataset.cache.dir}` : ''
      }/statistics.json`;

      if (ctx.query.proxy && ctx.query.proxy === 'true') {
        ctx.body = request({
          uri: `https:${url}`,
          method: 'GET',
        });
      } else {
        ctx.redirect(url);
      }

      return;
    }
  }
}

router.get('/stats/:aoiId', existDataset, addDateRange, StatsRouter.getStats);

export default router;
