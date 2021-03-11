import { Reader } from 'importer/interfaces/reader';
import { Transform, Readable } from 'stream';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { logger } from 'logger';
import * as ejs from 'ejs';
import * as dateformat from 'dateformat';
import { tmpdir } from 'os';
import * as avro from 'avsc';
import * as MultiStream from 'multistream';

const normalizeData = new Transform({
  readableObjectMode: true,
  writableObjectMode: true,
  transform(data, enc, cb) {
    data.lon = parseFloat(data.lon);
    data.lat = parseFloat(data.lat);
    data.timestamp = data.timestamp.value;
    this.push(data);
    cb();
  },
});

export default class BigQueryReader implements Reader {
  bigquery;
  tmpDir: string;
  files;

  constructor(
    private options: any,
    private date: string,
    private period: string,
  ) {}

  async init(): Promise<void> {
    this.tmpDir = tmpdir();
    let table;
    let bucket;
    const name = `${this.options.name}_${this.date}`.replace(/:/gi, '_');
    try {
      logger.debug('Init Bigquery reader');
      const query = await this.renderQuery();
      this.bigquery = new BigQuery({
        projectId: this.options.source.projectId,
      });
      const storage = new Storage({
        projectId: this.options.source.projectId,
      });
      logger.debug('Creating export table');
      [table] = await this.bigquery
        .dataset('scratch_raul')
        .createTable(`${name}_avro`);
      logger.debug('Creating query job');
      let [job] = await this.bigquery.createQueryJob({
        query,
        destination: table,
      });
      logger.debug('Checking create table job');
      await this.checkJob(job);
      const options = {
        format: 'avro',
        gzip: false,
      };
      logger.debug('Creating extract job');
      bucket = storage.bucket('raul-tiles-scratch-60ttl');
      [job] = await table.createExtractJob(
        bucket.file(`ingest-avro/${name}/*.avro`),
        options,
      );
      logger.debug('Checking export job');
      await this.checkJob(job);

      logger.debug('Obtaining files');
      const files = await bucket.getFiles({
        autoPaginate: false,
        prefix: `ingest-avro/${name}`,
      });
      logger.debug('Downloading files');
      // await Promise.all()
      this.files = [];
      await Promise.all(
        files[0].map((f) => {
          const fileName = f.name.split('/')[f.name.split('/').length - 1];
          console.log('Downloading file in ', `${this.tmpDir}/${fileName}`);
          this.files.push(`${this.tmpDir}/${fileName}`);
          return f.download({
            destination: `${this.tmpDir}/${fileName}`,
          });
        }),
      );
    } catch (err) {
      logger.error(err);
    } finally {
      if (table) {
        logger.debug('Removing intermediate table');
        await table.delete();
        logger.debug('Removed intermediate table successfully');
      }
      if (bucket) {
        logger.debug('Removing files from gcs');
        await bucket.deleteFiles({ prefix: `ingest-avro/${name}` });
        logger.debug('Removed files from gcs successfully');
      }
    }
  }

  async checkJob(job) {
    for (;;) {
      const obtainedJob = this.bigquery.job(job.id);

      const [jobResult] = await obtainedJob.get();
      console.log(jobResult.metadata.status);
      if (jobResult.metadata.status.state === 'RUNNING') {
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });
      } else if (jobResult.metadata.status.state === 'DONE') {
        if (
          jobResult.metadata.status.errors &&
          jobResult.metadata.status.errors.length > 0
        ) {
          throw new Error(jobResult.metadata.status.error[0].message);
        }
        break;
      } else {
        throw new Error('Error generating intermediate table');
      }
    }
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
    let i = 0;
    return new MultiStream(
      (cb) => {
        if (i === this.files.length) {
          return cb(null, null);
        }
        logger.debug('Reading file ' + this.files[i]);
        const stream = avro.createFileDecoder(this.files[i]);
        i++;
        cb(null, stream);
      },
      { objectMode: true },
    );
  }
  async finish(): Promise<void> {
    console.log('Finish');
  }
}
