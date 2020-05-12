import { worker } from 'workerpool';
import { TileService } from 'common/services/tile.service';
import { logger } from 'logger';
import { Pool } from 'pg';
import { Storage } from '@google-cloud/storage';
import { PassThrough } from 'stream';
import { writeFileSync } from 'fs';

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

async function generateTileHeatmap(options, coords) {
  try {
    const query = await TileService.generateQuery(
      coords,
      [options],
      'heatmap',
      undefined,
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
    );
    await uploadGCSBuffer(options, 'heatmap', coords, buff);

    logger.debug('Generating heatmap (intArray) tile');
    buff = await TileService.generateHeatmapTile(
      [options],
      coords,
      [data],
      { temporalAggregation: options.heatmap.temporalAggregation },
      'intArray',
    );

    await uploadGCSBuffer(options, 'intArray', coords, buff);
  } catch (err) {
    console.error(err);
  }
}

async function uploadGCSBuffer(options, name, coords, buffer) {
  logger.debug('Uploading to gcs');
  const file = await TileService.zip(buffer);
  if (!storage) {
    storage = new Storage({
      projectId: options.target.projectId,
    });
  }
  const writeStream = storage
    .bucket(options.cache.bucket)
    .file(
      `${options.cache.dir ? `${options.cache.dir}/` : ''}${name}-${coords.z}-${
        coords.x
      }-${coords.y}.pbf`,
    )
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

async function generateTilePosition(options, coords) {
  try {
    logger.debug('Generating position tile');
    const query = await TileService.generateQuery(
      coords,
      [options],
      'position',
    );
    console.log('query', query);
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
    await uploadGCSBuffer(options, 'position', coords, buff);
  } catch (err) {
    console.error(err);
  }
}

worker({
  generateTileHeatmap,
  generateTilePosition,
});
