import { Writer } from 'importer/interfaces/writer';
import { Writable } from 'stream';
import { createWriteStream } from 'fs';

function toString(options, data) {
  let row = `${data.lat},${data.lon},${data.pos},${data.cell},${
    data.timestamp
  },${data.htime !== undefined ? `${data.htime}` : ''}`;
  options.extraColumns.forEach((c) => {
    row += `,${data[c] !== undefined && data[c] !== null ? data[c] : 'NULL'}`;
  });
  return row;
}

export default class ConsoleWriter implements Writer {
  stream: Writable;
  buffer: any[];
  writers: any[];
  sizeBuffer = 2;

  constructor(
    private options: any,
    private date: string,
    private period: string,
  ) {}

  async updateMetadata(): Promise<void> {}

  flushBuffer() {
    this.buffer.forEach((value) => {
      value.forEach((v, i) => {
        this.writers[i].write(`${toString(this.options, v)}\n`);
      });
    });
  }

  async init(): Promise<void> {
    this.writers = [];
    for (let i = 0; i <= this.options.maxZoom; i++) {
      this.writers.push(
        createWriteStream(`${this.options.target.path}/${i}.csv`),
      );
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
  }
}
