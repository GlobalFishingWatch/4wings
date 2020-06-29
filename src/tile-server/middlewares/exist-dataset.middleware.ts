import { PostgresService } from './../services/postgres.service';
import * as SqlWhereParser from 'sql-where-parser';

const parser = new SqlWhereParser();

function checkFilterFieldsInDataset(dataset, filters) {
  if (Array.isArray(filters)) {
    filters.forEach((filter) => checkFilterFieldsInDataset(dataset, filter));
  } else {
    Object.keys(filters).forEach((k) => {
      if (k.toLowerCase() === 'and' || k.toLowerCase() === 'or') {
        checkFilterFieldsInDataset(dataset, filters[k]);
      } else if (Array.isArray(filters[k])) {
        // check column
        if (
          !filters[k].some(
            (c) =>
              dataset.searchColumns.indexOf(c) >= 0 ||
              ['timestamp', 'lat', 'lon', 'htime'].indexOf(c) >= 0,
          )
        ) {
          throw new Error(
            `Some column of ${filters[k]} is not supported to search. Supported columns: ${dataset.searchColumns}`,
          );
        }
      } else {
        // its a part of the and/or
        checkFilterFieldsInDataset(dataset, filters[k]);
      }
    });
  }
}

export async function existDataset(ctx, next) {
  const datasets = ctx.params.dataset.split(',');
  try {
    if (ctx.query.filters && ctx.query.filters.trim()) {
      ctx.state.filters = parser.parse(ctx.query.filters);
    }
  } catch (err) {
    ctx.throw(400, 'Incorrect filters');
  }

  ctx.state.dataset = await Promise.all(
    datasets.map(async (d) => {
      const dataset = await PostgresService.getDatasetById(d);
      if (!dataset) {
        ctx.throw(404, 'Dataset not found');
        return;
      }
      if (ctx.state.filters) {
        try {
          checkFilterFieldsInDataset(dataset, ctx.state.filters);
        } catch (err) {
          ctx.throw(400, err.message);
          return;
        }
      }
      if (ctx.query.mode) {
        if (dataset.searchColumns.indexOf(ctx.query.mode) === -1) {
          ctx.throw(400, `${ctx.query.mode} not is searchable`);
        }
        ctx.state.mode = ctx.query.mode;
      }
      ctx.state.temporalAggregation = dataset.heatmap.temporalAggregation;
      if (ctx.query['temporal-aggregation'] !== undefined) {
        if (ctx.query['temporal-aggregation'] === 'true') {
          ctx.state.temporalAggregation = true;
        } else {
          ctx.state.temporalAggregation = false;
        }
      }
      return dataset;
    }),
  );

  await next();
}
