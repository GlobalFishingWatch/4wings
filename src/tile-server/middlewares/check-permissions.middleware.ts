import * as authMiddleware from 'auth-middleware';

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

export async function checkPermissions(ctx, next) {
  const datasetIdGroups = parseDatasets(ctx);
  for (let i = 0; i < datasetIdGroups.length; i++) {
    authMiddleware.utils.checkSomePermissionsInList(ctx.state.permissions, [
      {
        action: 'read',
        type: 'dataset',
        value: datasetIdGroups[i],
      },
    ]);
  }

  await next();
}
