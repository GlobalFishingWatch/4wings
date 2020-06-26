import { Writer } from 'importer/interfaces/writer';
import { Writable } from 'stream';
import { createWriteStream, createReadStream } from 'fs';
import * as ejs from 'ejs';
import { logger } from 'logger';
import { Pool } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { tmpdir } from 'os';

function toString(options, data) {
  let row = `${data.lat},${data.lon},${data.pos},${data.cell},${
    data.timestamp
  },${data.htime !== undefined ? `${data.htime}` : ''}`;
  options.extraColumns.forEach((c) => {
    row += `,${data[c] !== undefined && data[c] !== null ? data[c] : ''}`;
  });
  return row;
}

export default class PostgresWriter implements Writer {
  stream: Writable;
  buffer: any[];
  writers: any[];
  sizeBuffer = 2;
  pool: any;
  tmpDir: string;
  constructor(
    private options: any,
    private date: string,
    private period: string,
  ) {}

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
      extraColumns: this.options.target.columnsDefinition,
    };
    const tables = await ejs.renderFile(
      `${__dirname}/templates/tables.ejs`,
      generationOptions,
    );
    console.log(tables)
    await this.pool.query(tables);
    logger.debug('Tables created successfully');
  }
  async clusterData() {
    let client;
    try {
      logger.debug('Creating cluster sqls');
      const generationOptions = {
        ...this.options,
      };
      const tables = await ejs.renderFile(
        `${__dirname}/templates/cluster-index.ejs`,
        generationOptions,
      );
      client = await this.pool.connect();
      await client.query(tables);

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

  async insertData() {
    logger.debug('Inserting data');

    const client = await this.pool.connect();
    for (let i = 0; i <= this.options.maxZoom; i++) {
      await new Promise((resolve, reject) => {
        logger.debug(`Importing ${this.tmpDir}/${i}.csv`);
        const writeStream = client.query(
          copyFrom(
            `COPY ${
              this.options.name
            }_z${i} (lat, lon, pos, cell, timestamp,htime,${this.options.extraColumns.join(
              ',',
            )}) FROM STDIN DELIMITERS ',' CSV`,
          ),
        );
        const readStream = createReadStream(`${this.tmpDir}/${i}.csv`);
        readStream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('end', resolve);
        // await pipeline(readStream, writeStream);
        readStream.pipe(writeStream);
      });
    }

    logger.debug('Data imported successfully');
  }
  async initDB() {
    this.pool = new Pool(this.options.target.database);
  }

  async init(): Promise<void> {
    await this.initDB();
    await this.createTables();
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
        select max(timestamp) as max, min(timestamp) as min from ${this.options.name}_z0
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
    await this.insertData();
    await this.clusterData();
  }
}
