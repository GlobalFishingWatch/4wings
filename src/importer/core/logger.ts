import { Transform } from 'stream';
import { logger } from 'logger';

const DEFAULT_OPTS = {
  batchSize: 1000,
};

export class LoggerTransform extends Transform {
  options: any;
  count = 0;
  constructor(options = DEFAULT_OPTS) {
    super({
      readableObjectMode: true,
      writableObjectMode: true,
    });
    this.options = { ...DEFAULT_OPTS, ...options };
  }
  // @ts-ignore
  _transform(chunk, enc, cb) {
    this.count++;
    if (this.count > 0 && this.count % this.options.batchSize === 0) {
      logger.info(`${this.count} rows readed`);
    }
    this.push(chunk);
    cb();
  }
}
