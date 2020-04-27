import { PostgresService } from './../services/postgres.service';

function parseFilter(value) {
  const parts = value.split(/<=|<|>=|>|!=|==| IN | in /);
  if (parts.length === 1) {
    throw new Error('Error filter without value');
  }
  const column: any = {
    column: parts[0].trim(),
    value: parts[1].trim(),
  };
  if (value.indexOf('>=') >= 0) {
    column.comparator = '>=';
  } else if (value.indexOf('<=') >= 0) {
    column.comparator = '<=';
  } else if (value.indexOf('<') >= 0) {
    column.comparator = '<';
  } else if (value.indexOf('>') >= 0) {
    column.comparator = '>';
  } else if (value.indexOf('==') >= 0) {
    column.comparator = '=';
  } else if (value.indexOf('!=') >= 0) {
    column.comparator = '<>';
  } else if (value.toLowerCase().indexOf('in') >= 0) {
    column.comparator = 'IN';
  } else {
    return null;
  }
  return column;
}

function parseFiltersQuery(dataset, queryFilter) {
  const filters = queryFilter.split(/ and | or | AND | OR /);
  // check if the keys are part of the searchColumns in the dataset
  const columns = filters
    .map(parseFilter)
    .filter(
      (c) =>
        dataset.searchColumns.indexOf(c.column) >= 0 ||
        ['timestamp', 'lat', 'lon', 'pos', 'htime'].indexOf(c.column) >= 0,
    );
  return {
    columns,
    union:
      queryFilter.indexOf(' and ') >= 0 || queryFilter.indexOf(' AND ') >= 0
        ? 'and'
        : 'or',
  };
}

export async function existDataset(ctx, next) {
  const datasets = ctx.params.dataset.split(',');

  ctx.state.dataset = await Promise.all(
    datasets.map(async (d) => {
      const dataset = await PostgresService.getDatasetById(d);
      if (!dataset) {
        ctx.throw(404, 'Dataset not found');
        return;
      }
      if (ctx.query.filters) {
        try {
          ctx.state.filters = parseFiltersQuery(dataset, ctx.query.filters);
        } catch (err) {
          ctx.throw(400, 'Incorrect filters');
          return;
        }
      }
      if (ctx.query.mode) {
        if (dataset.searchColumns.indexOf(ctx.query.mode) === -1) {
          ctx.throw(400, `${ctx.query.mode} not is searchable`);
        }
        ctx.state.mode = ctx.query.mode;
      }

      if (ctx.query['temporal-aggregation'] === 'true') {
        ctx.state.temporalAggregation = true;
      } else {
        ctx.state.temporalAggregation = false;
      }

      return dataset;
    }),
  );

  await next();
}
