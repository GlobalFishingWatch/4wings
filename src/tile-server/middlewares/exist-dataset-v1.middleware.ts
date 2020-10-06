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

function parseDatasets(ctx) {
  const keys = Object.keys(ctx.query).filter((key) =>
    key.startsWith('datasets'),
  );
  const datasets = new Array(keys.length);
  keys.forEach((k) => {
    const indexRegex = /datasets\[(?<index>[0-9]+)\]/gi;
    const resultRegex = indexRegex.exec(k);
    if (resultRegex.groups && resultRegex.groups.index) {
      datasets[parseInt(resultRegex.groups.index, 10)] = ctx.query[k].split(
        ',',
      );
    }
  });
  return datasets;
}

function parseFilters(ctx) {
  const keys = Object.keys(ctx.query).filter((key) =>
    key.startsWith('filters'),
  );
  const datasets = new Array(keys.length);
  keys.forEach((k) => {
    const indexRegex = /filters\[(?<index>[0-9]+)\]/gi;
    const resultRegex = indexRegex.exec(k);
    if (resultRegex.groups && resultRegex.groups.index) {
      datasets[parseInt(resultRegex.groups.index, 10)] = ctx.query[k].trim();
    }
  });
  return datasets;
}

export async function existDataset(ctx, next) {
  const datasetIdGroups = parseDatasets(ctx);
  const filters = parseFilters(ctx);
  const parsedFilters = filters.map((f) => parser.parse(f));
  ctx.state.filters = filters;
  if (filters.length === 0) {
    ctx.state.filters = [''];
  }

  if (ctx.query['date-range']) {
    ctx.state.dateRange = ctx.query['date-range'].split(',');
  } else {
    ctx.state.dateRange = [];
  }
  ctx.state.datasetGroups = new Array(datasetIdGroups.length);
  for (let i = 0; i < datasetIdGroups.length; i++) {
    const group = datasetIdGroups[i];
    try {
      const datasetGroup = await Promise.all(
        group.map(async (d) => {
          console.log('Obtaining ', d);
          const dataset = await PostgresService.getDatasetById(d);
          if (!dataset) {
            throw new Error('Dataset not found');
            return;
          }
          if (parsedFilters[i]) {
            checkFilterFieldsInDataset(dataset, parsedFilters[i]);
          }

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
      ctx.state.datasetGroups[i] = datasetGroup;
    } catch (err) {
      console.error(err);
      ctx.throw(400, err.message);
      return;
    }
  }

  await next();
}
