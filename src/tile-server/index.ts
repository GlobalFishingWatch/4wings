import { PostgresService } from './services/postgres.service';
import * as Koa from 'koa';
import * as Logger from 'koa-logger';
import * as Mount from 'koa-mount';
import * as Helmet from 'koa-helmet';
import * as Cors from '@koa/cors';
import * as Compress from 'koa-compress';
import * as Views from 'koa-views';
import * as Static from 'koa-static';

import mvtRouter from './routers/mvt.router';
import statsRouter from './routers/stats.router';
import * as authMiddleware from 'auth-middleware';

export async function start(args, overrideConfig) {
  const app = new Koa();
  if (process.env.NODE_ENV !== 'pro') {
    app.use(Logger());
  }
  app.use(
    Views(__dirname + '/html', {
      map: {
        html: 'ejs',
      },
    }),
  );
  app.use(Static(__dirname + '/html/static'));
  app.use(
    Mount('/map', async (ctx) => {
      const ids = await PostgresService.getAllDatasetIds();
      await ctx.render('index', { ids });
    }),
  );
  app.use(Cors());
  app.use(Helmet());
  app.use(
    Compress({
      threshold: 2048,
      flush: require('zlib').Z_SYNC_FLUSH,
    }),
  );

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      if (err instanceof authMiddleware.errors.HttpException) {
        ctx.throw(err.code, err.msg);
        return;
      }
      if (ctx.status) {
        throw err;
      }

      ctx.throw(500, 'Internal server error');
    }
  });

  app.use(mvtRouter.routes()).use(mvtRouter.allowedMethods());
  app.use(statsRouter.routes()).use(statsRouter.allowedMethods());

  const server = app.listen(process.env.PORT || 5000, () => {
    console.log(`Running mvt tile server in port ${process.env.PORT || 5000}`);
  });
  server.setTimeout(900000);
}
