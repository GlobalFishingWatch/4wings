import { worker } from 'workerpool';
import { TileService } from 'common/services/tile.service';
import { logger } from 'logger';
import { Pool } from 'pg';
import { Storage } from '@google-cloud/storage';
import { PassThrough } from 'stream';
import { DateTime } from 'luxon';

let pool = null;
let storage = null;

function getPool(dataset) {
  if (!pool) {
    logger.debug(`New pool for ${dataset.name}`);
    const connection: any = {
      user: dataset.target.database.user,
      database: dataset.target.database.database,
      password: dataset.target.database.password,
      max: 20,
    };
    if (process.env.NODE_ENV === 'dev') {
      connection.host = 'localhost';
    } else if (dataset.target.type === 'cloudsql') {
      connection.host = `${dataset.target.database.projectId}-${dataset.target.database.region}-${dataset.target.database.instanceId}`;
    } else {
      connection.host = dataset.target.database.host;
    }
    if (dataset.target.database.port) {
      connection.port = dataset.target.database.port;
    }
    pool = new Pool(connection);
  }
  return pool;
}

async function generateTileHeatmap(options, date, coords) {
  try {
    for (let i = 0; i < options.cache.periods.length; i++) {
      const period = options.cache.periods[i];
      logger.debug(`Generating cache for ${period}`);

      let interval = null;
      let filters = undefined;
      if (period === 'yearly') {
        interval = 86400;
        const startDate = DateTime.utc(date.getFullYear()).startOf('year');

        filters = `timestamp >= '${startDate.toISO()}' and timestamp <= '${startDate
          .plus({ year: 1, days: 100 })
          .toISO()}'`;
      } else if (period === 'all') {
        interval = 86400 * 10;
      }

      const query = await TileService.generateQuery(
        coords,
        [options],
        'heatmap',
        [filters],
        options.heatmap.temporalAggregation,
      );

      const data = await getPool(options).query(query[0]);
      if (!data || data.rows.length === 0) {
        console.log('no-tile');
        return;
      }
      logger.debug('Generating heatmap (mvt) tile');
      let buff = await TileService.generateHeatmapTile(
        [options],
        coords,
        [data],
        { temporalAggregation: options.heatmap.temporalAggregation },
        'heatmap',
        interval,
      );
      await uploadGCSBuffer(options, 'heatmap', period, date, coords, buff);

      logger.debug('Generating heatmap (intArray) tile');
      buff = await TileService.generateHeatmapTile(
        [options],
        coords,
        [data],
        { temporalAggregation: options.heatmap.temporalAggregation },
        'intArray',
        interval,
      );

      await uploadGCSBuffer(options, 'intArray', period, date, coords, buff);
    }
  } catch (err) {
    console.error(err);
  }
}

async function uploadGCSBuffer(options, name, period, date, coords, buffer) {
  logger.debug('Uploading to gcs');
  const file = await TileService.zip(buffer);
  if (!storage) {
    storage = new Storage({
      projectId: options.target.projectId,
    });
  }
  const filePath = `${
    options.cache.dir
      ? `${options.cache.dir}/${period}${
          period === 'yearly' ? `/${date.getFullYear()}` : ''
        }/`
      : ''
  }${name}-${coords.z}-${coords.x}-${coords.y}.pbf`;
  logger.debug('Uploading to ' + filePath);
  const writeStream = storage
    .bucket(options.cache.bucket)
    .file(filePath)
    .createWriteStream({
      metadata: {
        contentEncoding: 'gzip',
      },
    });
  const localReadStream = new PassThrough();
  localReadStream.end(file);
  await new Promise((resolve, reject) => {
    localReadStream
      .pipe(writeStream)
      .on('error', (err) => {
        return reject(err);
      })
      .on('finish', () => {
        return resolve();
      });
  });
  logger.debug('Uploaded file to gcs');
}

async function generateTilePosition(options, date, coords) {
  try {
    logger.debug('Generating position tile');
    for (let i = 0; i < options.cache.periods.length; i++) {
      const period = options.cache.periods[i];
      logger.debug(`Generating position cache for ${period}`);
      const query = await TileService.generateQuery(
        coords,
        [options],
        'position',
      );

      const data = await getPool(options).query(query[0]);
      if (!data || data.rows.length === 0) {
        console.log('no-tile');
        return;
      }
      const buff = await TileService.generatePositionTile(
        data.rows,
        [options],
        coords,
      );
      await uploadGCSBuffer(options, 'position', period, date, coords, buff);
    }
  } catch (err) {
    console.error(err);
  }
}

worker({
  generateTileHeatmap,
  generateTilePosition,
});
