import { Readable } from 'stream';

export interface Reader {
  init(): Promise<void>;

  getReadStream(): Promise<Readable>;

  finish(): Promise<void>;
}
