import * as Koa from 'koa';
import { DateTime } from 'luxon';
import * as request from 'request';

function existTuple(filters, column, operator, value) {
  if (!filters) {
    return false;
  }
  if (Array.isArray(filters)) {
    return filters.some((filter) => {
      return existTuple(filter, column, operator, value);
    });
  } else {
    return Object.keys(filters).some((k) => {
      if (k.toLowerCase() === 'and' || k.toLowerCase() === 'or') {
        return existTuple(filters[k], column, operator, value);
      } else if (Array.isArray(filters[k])) {
        // check column
        const existColumn = filters[k].indexOf(column) >= 0;
        const existValue = filters[k].indexOf(value) >= 0;
        const isOperator = k === operator;
        return existColumn && existValue && isOperator;
      } else {
        // its a part of the and/or
        return existTuple(filters[k], column, operator, value);
      }
    });
  }
}

function numFilters(filters) {
  let num = 0;
  if (Array.isArray(filters)) {
    filters.forEach((filter) => {
      num += numFilters(filter);
    });
  } else {
    Object.keys(filters).forEach((k) => {
      if (k.toLowerCase() === 'and' || k.toLowerCase() === 'or') {
        num += numFilters(filters[k]);
      } else if (Array.isArray(filters[k])) {
        num++;
      } else {
        // its a part of the and/or
        num += numFilters(filters[k]);
      }
    });
  }
  return num;
}

function allDataFilters(dataset, dateRange, interval, temporalAggregation) {
  if (!dateRange[0] && !dateRange[1]) {
    return true;
  }
  const sameDates =
    new Date(dataset.startDate).getTime() ===
      new Date(dateRange[0]).getTime() &&
    new Date(dataset.endDate).getTime() === new Date(dateRange[1]).getTime();
  if (
    sameDates &&
    (!interval || interval === '10days' || temporalAggregation)
  ) {
    return true;
  }
}

function yearCache(dataset, dateRange = [], interval) {
  for (
    let year = new Date(dataset.startDate).getFullYear();
    year <= new Date(dataset.endDate).getFullYear();
    year++
  ) {
    const date = DateTime.utc(year).startOf('year');

    let checkStartDate = false;
    let checkEndDate = false;
    if (dateRange) {
      checkStartDate = date.toISO() === dateRange[0];

      checkEndDate = date.plus({ year: 1, days: 100 }).toISO() === dateRange[1];
    }

    if (checkEndDate && checkStartDate && interval === 'day') {
      return year;
    }
  }
  return null;
}

export async function cache(ctx: Koa.ParameterizedContext, next) {
  if (
    (ctx.state.datasetGroups && ctx.state.datasetGroups.length > 1) ||
    (ctx.state.datasetGroups[0] && ctx.state.datasetGroups[0].length > 1) ||
    (ctx.state.filters && ctx.state.filters[0]) ||
    ctx.state.temporalAggregation !==
      ctx.state.datasetGroups[0][0].heatmap.temporalAggregation
  ) {
    console.log('Not cache because several datasets');
    await next();
    ctx.set('cache-control', 'public, max-age=3600000');
    return;
  }

  const yearOfCache = yearCache(
    ctx.state.datasetGroups[0][0],
    ctx.state.dateRange,
    ctx.query.interval,
  );
  const allYears = allDataFilters(
    ctx.state.datasetGroups[0][0],
    ctx.state.dateRange,
    ctx.query.interval,
    ctx.state.temporalAggregation,
  );

  if (
    !yearOfCache &&
    !allYears &&
    ctx.state.dateRange &&
    ctx.query.interval !== '10days' &&
    ctx.query.interval !== 'day'
  ) {
    console.log('Not cache');
    await next();
    return;
  }

  const dataset = ctx.state.datasetGroups[0][0];
  if (!dataset.cache) {
    console.log('Cache not configured');
    await next();
    return;
  }
  const bucket = dataset.cache.bucket;

  const cacheValues = dataset[ctx.params.type];
  if (
    cacheValues.cache &&
    parseInt(ctx.params.z, 10) >= cacheValues.fromLevelCache &&
    parseInt(ctx.params.z, 10) <= cacheValues.toLevelCache
  ) {
    let name = ctx.params.type;
    if (ctx.params.type === 'heatmap' && ctx.query.format === 'intArray') {
      name = 'intArray';
    }
    let url;

    if (yearOfCache) {
      url = `${bucket.replace('gs://', '//storage.googleapis.com/')}${
        dataset.cache.dir ? `/${dataset.cache.dir}` : ''
      }/yearly/${yearOfCache}/${name}-${ctx.params.z}-${ctx.params.x}-${
        ctx.params.y
      }.pbf?rand=${Math.random()}`;
    } else {
      url = `${bucket.replace('gs://', '//storage.googleapis.com/')}${
        dataset.cache.dir ? `/${dataset.cache.dir}` : ''
      }${
        ctx.state.datasetGroups[0][0].name !== 'carriers_v8_hd' &&
        !ctx.state.datasetGroups[0][0].heatmap.temporalAggregation
          ? '/all'
          : ''
      }/${name}-${ctx.params.z}-${ctx.params.x}-${
        ctx.params.y
      }.pbf?rand=${Math.random()}`;
    }

    if (ctx.query.proxy && ctx.query.proxy === 'true') {
      ctx.body = request({
        uri: `https:${url}`,
        method: 'GET',
      });
    } else {
      ctx.redirect(url);
    }
    return;
  }

  await next();
}
