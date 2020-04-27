import { Transform } from 'stream';
import { parseElement } from './parser';

export class ConverterTransform extends Transform {
  options: any;

  constructor(options) {
    super({
      readableObjectMode: true,
      writableObjectMode: true,
    });
    const newCellsByZoom = options.cellsByZoom.map(
      (v) => Math.sqrt(v) / 111320,
    );
    this.options = { ...options, cellsByZoom: newCellsByZoom };
  }
  _transform(chunk, enc, cb) {
    this.push(parseElement(this.options, chunk));
    cb();
  }
}
