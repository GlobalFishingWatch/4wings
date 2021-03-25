import { Reader } from 'importer/interfaces/reader';
import { Transform, Readable } from 'stream';
import { BigQuery } from '@google-cloud/bigquery';
import { logger } from 'logger';
import * as ejs from 'ejs';
import * as dateformat from 'dateformat';

const normalizeData = new Transform({
  readableObjectMode: true,
  writableObjectMode: true,
  transform(data, enc, cb) {
    data.lon = parseFloat(data.lon);
    data.lat = parseFloat(data.lat);
    data.timestamp = data.timestamp;
    this.push(data);
    cb();
  },
});

export default class BigQueryReader implements Reader {
  bigquery;

  constructor(
    private options: any,
    private date: string,
    private period: string,
  ) {}

  async init(): Promise<void> {
    logger.debug('Init Bigquery reader');
    this.bigquery = new BigQuery({
      projectId: this.options.source.projectId,
    });
  }

  async renderQuery() {
    const view = {
      formatDate(date, format) {
        return dateformat(date, format);
      },
      date: this.date,
      period: this.period,
    };
    return ejs.render(this.options.source.query, view);
  }

  async getReadStream(): Promise<Readable> {
    logger.debug('Obtaining Bigquery stream');
    const query = await this.renderQuery();
    console.log('query', query);
    return this.bigquery.createQueryStream(query).pipe(normalizeData);
  }
  async finish(): Promise<void> {
    console.log('Finish');
  }
}
