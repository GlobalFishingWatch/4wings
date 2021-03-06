import { ConverterTransform } from './converter';
import { LoggerTransform } from './logger';
import { Reader } from 'importer/interfaces/reader';
import { Writer } from 'importer/interfaces/writer';
import * as objectAssignDeep from 'object-assign-deep';
import { logger } from 'logger';
import * as stream from 'stream';
import { promisify } from 'util';
import { getOptions } from 'common/utils';
const pipeline = promisify(stream.pipeline);

async function getConfig({
  url,
  configEncoded,
  token,
  overrideConfig,
}): Promise<any> {
  let config: any = {};
  if (url) {
    logger.debug('Obtaining config');
    config = await getOptions(url, token);
  }
  if (configEncoded) {
    logger.debug('Decoding config');
    config = JSON.parse(Buffer.from(configEncoded, 'base64').toString());
  }
  return objectAssignDeep(config, overrideConfig);
}

export async function run(
  { url, configEncoded, date, period, token },
  overrideConfig,
) {
  logger.debug('Obtaining options');
  let config: any = await getConfig({
    url,
    configEncoded,
    token,
    overrideConfig,
  });

  if (config.target && !config.target.addMarkColumn) {
    config.addMarkColumn = false;
  }

  let reader: Reader;
  let writer: Writer;
  try {
    logger.debug('Initializing reader');
    const readerClass = (await import(`../readers/${config.source.type}`))
      .default;
    reader = new readerClass(config, date, period);
    await reader.init();
  } catch (err) {
    logger.error('Error initializing reader', err);
    throw err;
  }
  try {
    logger.debug('Initializing writer');
    const writerClass = (await import(`../writers/${config.target.type}`))
      .default;
    writer = new writerClass(config, date, period);
    await writer.init();
  } catch (err) {
    logger.error('Error initializing writer', err);
    throw err;
  }

  const readStream = await reader.getReadStream();
  const writeStream = await writer.getWriteStream();

  const converterTransform = new ConverterTransform(config);
  const loggerTransform = new LoggerTransform();
  try {
    logger.debug('Executing pipeline');
    await pipeline(
      readStream,
      converterTransform,
      loggerTransform,
      writeStream,
    );
  } catch (err) {
    logger.error('Error executing pipeline', err);
    throw err;
  }
  try {
    logger.debug('Finishing reader');
    await reader.finish();
  } catch (err) {
    logger.error('Error finishing reader', err);
    throw err;
  }
  try {
    logger.debug('Finishing writer');
    await writer.finish();
  } catch (err) {
    logger.error('Error finishing writer', err);
    throw err;
  }
  try {
    logger.debug('Updating metadata');
    await writer.updateMetadata();
  } catch (err) {
    logger.error('Error finishing writer', err);
    throw err;
  }
}
