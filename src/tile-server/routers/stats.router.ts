import * as Router from '@koa/router';
import * as Koa from 'koa';
import { existDataset } from 'tile-server/middlewares/exist-dataset.middleware';

const router = new Router({
  prefix: '/v1',
});

class StatsRouter {
  static async getStats(ctx: Koa.ParameterizedContext) {
    const dataset = ctx.state.dataset[0];
    const bucket = dataset.cache.bucket;
    const url = `${bucket.replace('gs://', '//storage.googleapis.com/')}${
      dataset.cache.dir ? `/${dataset.cache.dir}` : ''
    }/statistics.json`;
    ctx.redirect(url);
    return;
  }
}

router.get('/:dataset/stats/:aoiId', existDataset, StatsRouter.getStats);

export default router;
