const zlib = require('zlib');
const protobuf = require('protobufjs');
const { byAlpha3 } = require('iso-country-codes');

export async function generateCustomPBF(
  datasets,
  ctxState,
  results,
  numCellsLat,
  numCellsLon,
) {
  const numDatasets = datasets.length;
  let lengthArray = 2;
  const featuresProps = [];
  results
    .filter((el) => el)
    .forEach((el) => {
      const cell = el.cell;
      delete el.cell;
      delete el.lat;
      delete el.lon;
      if (!ctxState.temporalAggregation) {
        const htimes = Object.keys(el).map((h) => parseInt(h, 10));
        const max = Math.max(...htimes);
        const min = Math.min(...htimes);

        featuresProps.push({
          cell,
          max,
          min,
          data: el,
        });
        let items = (max - min + 1) * numDatasets;
        if (ctxState.mode) {
          items *= 2;
        }

        lengthArray += items + 3;
      } else {
        featuresProps.push({
          cell,
          value: el.value,
        });
        let items = 2;
        if (ctxState.mode) {
          items = 3;
        }
        lengthArray += items;
      }
    });

  const data = new Uint32Array(lengthArray);
  data[0] = numCellsLat;
  data[1] = numCellsLon;
  let index = 2;
  for (let i = 0; i < featuresProps.length; i++) {
    const el = featuresProps[i];
    data[index++] = el.cell;
    if (ctxState.temporalAggregation) {
      // console.log(el);
      data[index++] = el.value;
      if (ctxState.mode) {
        if (el.data[`${ctxState.mode}`] === undefined) {
          data[index++] = 0;
        } else {
          if (ctxState.mode.toLowerCase() === 'flag') {
            data[index++] = parseInt(
              byAlpha3[el.data[`${ctxState.mode}`]].numeric,
              10,
            );
          } else {
            results[index++] = el.data[`${ctxState.mode}`];
          }
        }
      }
    } else {
      data[index++] = el.min;
      data[index++] = el.max;
      for (let i = el.min; i <= el.max; i++) {
        if (numDatasets === 1) {
          const value = el.data[i.toString()] ? el.data[i.toString()] : 0;
          data[index++] = value;
          if (ctxState.mode) {
            if (el.data[`${i.toString()}_${ctxState.mode}`] === undefined) {
              data[index++] = 0;
            } else {
              if (ctxState.mode.toLowerCase() === 'flag') {
                data[index++] = parseInt(
                  byAlpha3[el.data[`${i.toString()}_${ctxState.mode}`]].numeric,
                  10,
                );
              } else {
                results[index++] = el.data[`${i.toString()}_${ctxState.mode}`];
              }
            }
          }
        } else {
          for (let j = 0; j < numDatasets; j++) {
            const value = el.data[i.toString()] ? el.data[i.toString()][j] : 0;
            data[index++] = value;
            if (ctxState.mode) {
              if (el.data[`${i.toString()}_${ctxState.mode}`] === undefined) {
                data[index++] = 0;
              } else {
                if (ctxState.mode.toLowerCase() === 'flag') {
                  results[index++] = parseInt(
                    byAlpha3[el.data[`${i.toString()}_${ctxState.mode}`][j]],
                    10,
                  );
                } else {
                  results[index++] =
                    el.data[`${i.toString()}_${ctxState.mode}`][j];
                }
              }
            }
          }
        }
      }
    }
  }

  const proto = await protobuf.load(`${__dirname}/../proto/tile.proto`);
  const protoTile = proto.lookupType('tile.Tile');
  const pbf = protoTile.encode(protoTile.create({ data })).finish();

  // const compressed = await new Promise((resolve, reject) => {
  //   zlib.gzip(pbf, (err, data) => {
  //     if (err) {
  //       logger.error('Error zipping response');
  //       reject(err);
  //       return;
  //     }
  //     resolve(data);
  //   });
  // });
  // ctx.set('content-type', 'application/vnd.mapbox-vector-tile');
  // ctx.set('Content-Encoding', 'gzip');
  // if (ctxState.mode) {
  //   ctx.set('columns', `count,${ctxState.mode}`);
  // } else {
  //   ctx.set('columns', `count`);
  // }
  // ctx.body = pbf;
  return pbf;
}
