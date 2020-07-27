import * as Koa from 'koa';

function existTuple(filters, column, operator, value) {
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

function allDataFilters(dataset, filters) {
  const checkStartDate = existTuple(
    filters,
    'timestamp',
    '<=',
    dataset.endDate,
  );
  const checkEndDate = existTuple(
    filters,
    'timestamp',
    '>=',
    dataset.startDate,
  );
  return checkEndDate && checkStartDate && numFilters(filters) === 2;
}

export async function cache(ctx: Koa.ParameterizedContext, next) {
  if (
    (ctx.state.dataset && ctx.state.dataset.length > 1) ||
    ctx.state.mode ||
    (ctx.state.filters &&
      !allDataFilters(ctx.state.dataset[0], ctx.state.filters))
  ) {
    console.log('Not cache');
    await next();
    ctx.set('cache-control', 'public, max-age=3600000');
    return;
  }

  if (
    ctx.state.dataset[0].name === 'fishing_v3' &&
    ctx.query.interval !== '10days'
  ) {
    console.log('Not cache');
    await next();
    return;
  }

  const dataset = ctx.state.dataset[0];
  if (!dataset.cache) {
    console.log('Cache not configured');
    await next();
    return;
  }
  const bucket = dataset.cache.bucket;
  // if (dataset.name === 'fishing_v3') {
  //   dataset.heatmap.cache = true;
  // }
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
    const url = `${bucket.replace('gs://', '//storage.googleapis.com/')}${
      dataset.cache.dir ? `/${dataset.cache.dir}` : ''
    }${ctx.state.dataset[0].name !== 'carriers_v8_hd' ? '/all' : ''}/${name}-${
      ctx.params.z
    }-${ctx.params.x}-${ctx.params.y}.pbf`;
    ctx.redirect(url);
    return;
  }

  await next();
}
