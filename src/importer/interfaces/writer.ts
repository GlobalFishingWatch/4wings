import { Writable } from 'stream';

export interface Writer {
  init(): Promise<void>;

  getWriteStream(): Promise<Writable>;

  finish(): Promise<void>;

  updateMetadata(): Promise<void>;
}
