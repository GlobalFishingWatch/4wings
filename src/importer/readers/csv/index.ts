import { Reader } from 'importer/interfaces/reader';
import { createReadStream, ReadStream } from 'fs';
import * as csv from 'csv-parser';
import { Transform, Readable } from 'stream';

const normalizeData = new Transform({
  readableObjectMode: true,
  writableObjectMode: true,
  transform(data, enc, cb) {
    data.lon = parseFloat(data.lon);
    data.lat = parseFloat(data.lat);
    this.push(data);
    cb();
  },
});

export default class CSVReader implements Reader {
  constructor(
    private options: any,
    private date: string,
    private period: string,
  ) {}

  async init(): Promise<void> {
    console.log('init');
  }
  async getReadStream(): Promise<Readable> {
    console.log('Exec');
    return createReadStream(this.options.source.file)
      .pipe(csv())
      .pipe(normalizeData);
  }
  async finish(): Promise<void> {
    console.log('Finish');
  }
}
