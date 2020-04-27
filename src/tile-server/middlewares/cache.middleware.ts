import * as Koa from 'koa';

function allDataFilters(dataset, filters) {
  const checkStartDate = filters.columns.find((c) => {
    return (
      c.column === 'timestamp' &&
      c.comparator === '<=' &&
      c.value === `'${dataset.endDate}'`
    );
  });
  const checkEndDate = filters.columns.find((c) => {
    return (
      c.column === 'timestamp' &&
      c.comparator === '>=' &&
      c.value === `'${dataset.startDate}'`
    );
  });
  return checkEndDate && checkStartDate && filters.columns.length === 2;
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

  const dataset = ctx.state.dataset[0];
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
    const url = `${bucket.replace('gs://', '//storage.googleapis.com/')}${
      dataset.cache.dir ? `/${dataset.cache.dir}` : ''
    }/${name}-${ctx.params.z}-${ctx.params.x}-${ctx.params.y}.pbf`;
    ctx.redirect(url);
    return;
  }

  await next();
}
