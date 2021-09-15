import { Writer } from 'importer/interfaces/writer';
import { Writable } from 'stream';
import { createWriteStream, createReadStream } from 'fs';
import * as ejs from 'ejs';
import { logger } from 'logger';
import { Pool } from 'pg';
import { tmpdir } from 'os';
import { Storage } from '@google-cloud/storage';
import { importData } from './import-data';
import { DateTime } from 'luxon';

function toString(options, data) {
  let row = `${data.lat},${data.lon},${data.pos},${data.cell},${
    data.timestamp
  },${data.htime !== undefined ? `${data.htime}` : ''}`;
  options.extraColumns.forEach((c) => {
    row += `,${
      data[c] !== undefined && data[c] !== null
        ? typeof data[c] === 'string' && data[c].indexOf(',') >= 0
          ? `"${data[c]}"`
          : data[c]
        : ''
    }`;
  });
  return row;
}

export default class CloudSQLWriter implements Writer {
  stream: Writable;
  buffer: any[];
  writers: any[];
  sizeBuffer = 2;
  pool: any;
  tmpDir: string;
  storage: any;
  year: number;
  partitionName: string;
  startDate: string;
  endDate: string;
  importStartDate: string;
  importEndDate: string;
  constructor(
    private options: any,
    private date: string,
    private period: string,
  ) {
    if (options.target.partitioned) {
      this.year = new Date(this.date).getFullYear();
      const month = new Date(this.date).getMonth();
      if (options.target.partitionTime === 'monthly') {
        const luxonDate = DateTime.utc(this.year, month + 1).startOf('month');
        this.startDate = luxonDate.toISO().slice(0, 19).replace('T', ' ');
        this.endDate = luxonDate
          .plus({ month: 1 })
          .toISO()
          .slice(0, 19)
          .replace('T', ' ');
        this.partitionName = `${this.year}_${month + 1}`;
        console.log(this.partitionName);
        this.options.target.tmpStorage.dir = `${this.options.target.tmpStorage.dir}_${this.partitionName}`;
      } else {
        const luxonDate = DateTime.utc(this.year).startOf('year');
        this.startDate = luxonDate.toISO().slice(0, 19).replace('T', ' ');
        this.endDate = luxonDate
          .plus({ year: 1 })
          .toISO()
          .slice(0, 19)
          .replace('T', ' ');
        this.partitionName = `${this.year}`;
        this.options.target.tmpStorage.dir = `${this.options.target.tmpStorage.dir}_${this.partitionName}`;
      }
      const importDate = new Date(this.date);
      if (period === 'daily') {
        this.importStartDate = this.date;
        this.importEndDate = DateTime.utc(
          importDate.getFullYear(),
          importDate.getMonth() + 1,
          importDate.getDate(),
        )
          .plus({ day: 1 })
          .toISO()
          .slice(0, 10);
        this.options.target.tmpStorage.dir = `${
          this.options.target.tmpStorage.dir
        }_${date.replace(/-/, '_')}`;
      } else if (period === 'monthly') {
        const luxonDate = DateTime.utc(
          importDate.getFullYear(),
          importDate.getMonth() + 1,
        );
        this.importStartDate = luxonDate.startOf('month').toISO().slice(0, 10);
        this.importEndDate = luxonDate
          .startOf('month')
          .plus({ month: 1 })
          .toISO()
          .slice(0, 10);
      } else if (period === 'yearly') {
        const luxonDate = DateTime.utc(importDate.getFullYear());
        this.importStartDate = luxonDate.startOf('year').toISO().slice(0, 10);
        this.importEndDate = luxonDate
          .startOf('year')
          .plus({ year: 1 })
          .toISO()
          .slice(0, 10);
      }
    }
  }

  flushBuffer() {
    this.buffer.forEach((value) => {
      value.forEach((v, i) => {
        this.writers[i].write(`${toString(this.options, v)}\n`);
      });
    });
  }

  async createTables() {
    logger.debug('Creating tables');
    const generationOptions = {
      ...this.options,
      startDate: this.startDate,
      endDate: this.endDate,
      extraColumns: this.options.target.columnsDefinition,
      partitioned: this.options.target.partitioned ? true : false,
      partitionName: this.partitionName,
      importStartDate: this.importStartDate,
      importEndDate: this.importEndDate,
    };
    console.log(generationOptions);
    const tables = await ejs.renderFile(
      `${__dirname}/templates/tables.ejs`,
      generationOptions,
    );
    console.log(tables);
    await this.pool.query(tables);
    logger.debug('Tables created successfully');
  }
  async clusterData() {
    let client;
    try {
      logger.debug('Creating cluster sqls');
      const generationOptions = {
        ...this.options,
        startDate: this.startDate,
        endDate: this.endDate,
        year: this.year,
        partitioned: this.options.target.partitioned ? true : false,
        partitionName: this.partitionName,
      };
      for (let i = 0; i <= generationOptions.maxZoom; i++) {
        logger.debug(`Creating cluster for ${i} level`);
        generationOptions.level = i;
        const tables = await ejs.renderFile(
          `${__dirname}/templates/cluster-index.ejs`,
          generationOptions,
        );
        client = await this.pool.connect();
        await client.query(tables);
        client.release();
        client = null;
      }

      logger.debug('Tables clustered successfully');
    } catch (err) {
      logger.error('Error clustering tables', err);
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async createGeom() {
    let client;
    try {
      logger.debug('Updating geom column');
      const generationOptions = {
        ...this.options,
        startDate: this.startDate,
        endDate: this.endDate,
        year: this.year,
        partitioned: this.options.target.partitioned ? true : false,
        partitionName: this.partitionName,
      };
      const tables = await ejs.renderFile(
        `${__dirname}/templates/update-geom.ejs`,
        generationOptions,
      );
      client = await this.pool.connect();
      await client.query(tables);
      client.release();

      logger.debug('Table updated geom successfully');
    } catch (err) {
      logger.error('Error updating geom column', err);
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async uploadData() {
    for (let i = 0; i <= this.options.maxZoom; i++) {
      logger.debug(`Uploading file: ${this.tmpDir}/${i}.csv`);
      await this.storage
        .bucket(this.options.target.tmpStorage.bucket)
        .upload(`${this.tmpDir}/${i}.csv`, {
          destination: `${
            this.options.target.tmpStorage.dir
              ? `${this.options.target.tmpStorage.dir}/`
              : ''
          }${i}.csv`,
        });
    }
  }

  async insertData() {
    logger.debug('Inserting data');

    await importData(this.options);
    logger.debug('Data imported successfully');
    logger.debug('Removing tmp files of bucket');
    for (let i = 0; i <= this.options.maxZoom; i++) {
      await this.storage
        .bucket(this.options.target.tmpStorage.bucket)
        .file(
          `${
            this.options.target.tmpStorage.dir
              ? `${this.options.target.tmpStorage.dir}/`
              : ''
          }${i}.csv`,
        )
        .delete();
    }
  }
  async initDB() {
    const options = {
      ...this.options.target.database,
      host: `${this.options.target.database.projectId}-${this.options.target.database.region}-${this.options.target.database.instanceId}`,
    };
    if (process.env.NODE_ENV == 'dev') {
      options.host = 'localhost';
    }

    this.pool = new Pool(options);
  }

  async init(): Promise<void> {
    await this.initDB();
    await this.createTables();
    this.storage = new Storage({
      projectId: this.options.target.projectId,
    });
    this.tmpDir = tmpdir();
    this.writers = [];
    for (let i = 0; i <= this.options.maxZoom; i++) {
      this.writers.push(createWriteStream(`${this.tmpDir}/${i}.csv`));
    }
    this.buffer = [];
    this.stream = new Writable({
      objectMode: true,
      write: (chunk, enc, cb) => {
        this.buffer.push(chunk);
        if (this.buffer.length >= this.sizeBuffer) {
          this.flushBuffer();
          this.buffer = [];
        }
        cb();
      },
    });
  }
  async getWriteStream(): Promise<Writable> {
    return this.stream;
  }
  async finish(): Promise<void> {
    console.log('Finish');
    this.flushBuffer();
    await Promise.all(
      this.writers.map((w) => {
        w.end();
        return new Promise((resolve, reject) => {
          w.on('finish', () => {
            resolve();
          });
        });
      }),
    );
    await this.uploadData();
    if (this.options.target.clearBeforeInsert) {
      await this.deleteData();
    }
    await this.insertData();
    if (this.options.target.geom) {
      await this.createGeom();
    }
    await this.clusterData();
    await this.resamplingData();
  }

  async resamplingData() {
    let client;
    try {
      logger.debug('Creating resampling sqls');
      const generationOptions = {
        ...this.options,
        startDate: this.startDate,
        endDate: this.endDate,
        importStartDate: this.importStartDate,
        importEndDate: this.importEndDate,
        extraColumns: this.options.target.columnsDefinition,
        partitioned: this.options.target.partitioned ? true : false,
        partitionName: this.partitionName,
        groupColumn: this.options.heatmap.columns[0],
        ds: this.date,
      };

      logger.debug(`Creating resampling `);
      const tables = await ejs.renderFile(
        `${__dirname}/templates/resampling.ejs`,
        generationOptions,
      );
      console.log(tables);
      client = await this.pool.connect();
      await client.query(tables);

      logger.debug('Tables resampled successfully');
    } catch (err) {
      logger.error('Error resampling tables', err);
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async deleteData() {
    let client;
    try {
      logger.debug('Deleting previous data');
      const generationOptions = {
        ...this.options,
        partitioned: this.options.target.partitioned ? true : false,
        partitionName: this.partitionName,
      };
      for (let i = 0; i <= generationOptions.maxZoom; i++) {
        logger.debug(`Deleting previous data for ${i} level`);
        generationOptions.level = i;
        const tables = await ejs.renderFile(
          `${__dirname}/templates/delete-data.ejs`,
          generationOptions,
        );
        client = await this.pool.connect();
        await client.query(tables);
        client.release();
        client = null;
      }

      logger.debug('Data delete successfully');
    } catch (err) {
      logger.error('Error deleting data of tables', err);
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async updateMetadata(): Promise<void> {
    logger.debug('Updating metadata of dataset');
    let client;
    try {
      client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS datasets (
          id VARCHAR(200) not null,
          config jsonb not null,
          start_date timestamp,
          end_date timestamp,
          created_at timestamp DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);
      const res = await client.query(`
        select max(timestamp) as max, min(timestamp) as min from "${this.options.name}_z0"
      `);
      await client.query(
        `
        insert into datasets (id, config, start_date, end_date)
        values ($1, $2, $3, $4)
        on conflict (id) do update
        set config = EXCLUDED.config,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date;

      `,
        [this.options.name, this.options, res.rows[0].min, res.rows[0].max],
      );
      logger.debug('Updated metadata of dataset succesfully');
    } catch (err) {
      console.error('Error');
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  }
}
