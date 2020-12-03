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

async function removeGCSDir(options, date) {
  logger.debug('Removing remote dir (GCS)');
  const storage = new Storage({
    projectId: options.cache.projectId,
  });
  const optionsDel: any = {};
  if (options.cache.dir) {
    optionsDel.prefix = `${options.cache.dir}/`;
  }
  if (options.cache.periods) {
    for (let i = 0; i < options.cache.periods.length; i++) {
      const period = options.cache.periods[i];
      if (period === 'all') {
        optionsDel.prefix = `${options.cache.dir}/${period}`;
        continue;
      } else if (period === 'yearly') {
        optionsDel.prefix = `${
          options.cache.dir
        }/${period}/${date.getFullYear()}`;
      }
      logger.debug(`Removing ${optionsDel.prefix}`);
      await storage.bucket(options.cache.bucket).deleteFiles(optionsDel);
    }
  } else {
    await storage.bucket(options.cache.bucket).deleteFiles(optionsDel);
  }

  logger.debug('Removed successfully');
}

export async function run(
  url: string,
  date: Date,
  token: string,
  overrideConfig,
) {
  const pool = workerpool.pool(`${__dirname}/worker/worker.js`, {
    maxWorkers: 8,
  });

  logger.debug('Obtaining options');
  const options: any = await getOptions(url, token);

  // await removeGCSDir(options, date);

  if (options.heatmap && options.heatmap.cache) {
    logger.debug(
      'Generating cache for heatmap (heatmap and 4wings-pbf) formats',
    );
    const tiles = generateTilesOfLevel(
      options.heatmap.fromLevelCache,
      options.heatmap.toLevelCache,
    );

    tiles.forEach((tile) => {
      pool.exec('generateTileHeatmap', [options, new Date(date), tile]);
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
