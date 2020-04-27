import { logger } from 'logger';
import { getOptions } from 'common/utils';
import * as workerpool from 'workerpool';
import { Storage } from '@google-cloud/storage';

function generateTilesOfLevel(from: number, to: number) {
  const total = [];
  let initial = from;
  if (from <= 0) {
    initial = 0;
  }

  for (let i = initial; i <= to; i++) {
    for (let x = 0; x < Math.pow(2, i); x++) {
      for (let y = 0; y < Math.pow(2, i); y++) {
        total.push({
          x,
          y,
          z: i,
        });
      }
    }
  }

  return total;
}

async function removeGCSDir(options) {
  logger.debug('Removing remote dir (GCS)');
  const storage = new Storage({
    projectId: options.cache.projectId,
  });
  const optionsDel: any = {};
  if (options.cache.dir) {
    optionsDel.prefix = `${options.cache.dir}/`;
  }
  await storage.bucket(options.cache.bucket).deleteFiles(optionsDel);
  logger.debug('Removed successfully');
}

export async function run(url: string, token: string) {
  const pool = workerpool.pool(`${__dirname}/worker/worker.js`, {
    maxWorkers: 2,
  });

  logger.debug('Obtaining options');
  console.log(url);
  const options: any = await getOptions(url, token);
  console.log(options);

  await removeGCSDir(options);

  if (options.heatmap && options.heatmap.cache) {
    logger.debug(
      'Generating cache for heatmap (heatmap and 4wings-pbf) formats',
    );
    const tiles = generateTilesOfLevel(
      options.heatmap.fromLevelCache,
      options.heatmap.toLevelCache,
    );
    tiles.forEach((tile) => {
      pool.exec('generateTileHeatmap', [options, tile]);
    });
  } else {
    logger.debug('Not cache for heatmap');
  }
  if (options.position && options.position.cache) {
    logger.debug('Generating cache for position format');
  } else {
    logger.debug('Not cache for position');
  }

  await new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const stats = pool.stats();
      console.log(
        `Pending: ${stats.pendingTasks}; Busy workers: ${stats.busyWorkers}; Total workers: ${stats.totalWorkers}`,
      );
      if (stats.pendingTasks === 0 && stats.busyWorkers === 0) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
  logger.info('Finished cache');
}
