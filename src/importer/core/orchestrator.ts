import { ConverterTransform } from './converter';
import { LoggerTransform } from './logger';
import { Reader } from 'importer/interfaces/reader';
import { Writer } from 'importer/interfaces/writer';

import { logger } from 'logger';
import * as stream from 'stream';
import { promisify } from 'util';
import { getOptions } from 'common/utils';
const pipeline = promisify(stream.pipeline);

export async function run(url, date, period, token?) {
  logger.debug('Obtaining options');
  const options: any = await getOptions(url, token);

  let reader: Reader;
  let writer: Writer;
  try {
    logger.debug('Initializing reader');
    const readerClass = (await import(`../readers/${options.source.type}`))
      .default;
    reader = new readerClass(options, date, period);
    await reader.init();
  } catch (err) {
    logger.error('Error initializing reader', err);
    throw err;
  }
  try {
    logger.debug('Initializing writer');
    const writerClass = (await import(`../writers/${options.target.type}`))
      .default;
    writer = new writerClass(options);
    await writer.init();
  } catch (err) {
    logger.error('Error initializing writer', err);
    throw err;
  }

  const readStream = await reader.getReadStream();
  const writeStream = await writer.getWriteStream();

  const converterTransform = new ConverterTransform(options);
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
