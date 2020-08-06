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
  ctx.state.filters = [];
  if (ctx.query['date-range']) {
    ctx.state.dateRange = ctx.query['date-range'].split(',');
  } else {
    ctx.state.dateRange = [];
  }
  ctx.state.dataset = await Promise.all(
    datasets.map(async (d, i) => {
      let parsedFilters;
      let filters = '';
      if (ctx.state.dateRange && ctx.state.dateRange.length > 0) {
        filters = `timestamp > '${ctx.state.dateRange[0]}' and timestamp < '${ctx.state.dateRange[1]}'`;
      }
      try {
        if (ctx.query[`filters[${i}]`] && ctx.query[`filters[${i}]`].trim()) {
          filters += ` and ${ctx.query[`filters[${i}]`].trim()}`;

          parsedFilters = parser.parse(filters);
        }
      } catch (err) {
        ctx.throw(400, 'Incorrect filters');
      }
      const dataset = await PostgresService.getDatasetById(d);
      if (!dataset) {
        ctx.throw(404, 'Dataset not found');
        return;
      }
      if (parsedFilters) {
        try {
          checkFilterFieldsInDataset(dataset, parsedFilters);
        } catch (err) {
          ctx.throw(400, err.message);
          return;
        }
      }
      ctx.state.filters.push(filters);
      if (ctx.query.interval) {
        let interval = null;
        if (ctx.query.interval === 'day') {
          interval = 86400;
        } else if (ctx.query.interval === '10days') {
          interval = 86400 * 10;
        } else if (ctx.query.interval === 'hour') {
          interval = 3600;
        } else {
          ctx.throw(400, 'Interval selected not allowed');
          return;
        }

        if (dataset.heatmap.time && dataset.heatmap.time > interval) {
          ctx.throw(400, 'Interval selected lower than original');
          return;
        }
        ctx.state.interval = interval;
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
