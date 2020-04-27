import { Writer } from 'importer/interfaces/writer';
import { Writable } from 'stream';

export default class ConsoleWriter implements Writer {
  stream: Writable;

  constructor(
    private options: any,
    private date: string,
    private period: string,
  ) {}

  async init(): Promise<void> {
    this.stream = new Writable({
      objectMode: true,
      write(chunk, enc, cb) {
        console.log('>>>>>>', chunk);
        cb();
      },
    });
  }
  async getWriteStream(): Promise<Writable> {
    return this.stream;
  }
  async finish(): Promise<void> {
    console.log('Finish');
  }
  async updateMetadata(): Promise<void> {}
}
