const { GoogleAuth } = require('google-auth-library');
import { logger } from 'logger';

async function timeout(time) {
  await new Promise((resolve, reject) => setTimeout(resolve, time * 1000));
}

async function importFile(
  file,
  projectId,
  instanceid,
  database,
  table,
  columns,
) {
  logger.debug(`Importing file ${file} with columns ${columns.join(',')}`);
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const client = await auth.getClient();

  const url = `https://www.googleapis.com/sql/v1beta4/projects/${projectId}/instances/${instanceid}/import`;
  const body = {
    database,
    table,
    uri: file,
    csvImportOptions: {
      table,
    },
    fileType: 'CSV',
  };
  if (columns) {
    (body.csvImportOptions as any).columns = columns;
  }
  let res;
  try {
    res = await client.request({
      url,
      body: JSON.stringify({ importContext: body }),
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
    });
  } catch (err) {
    console.error('Error import');
    throw err;
  }
  try {
    await checkStatus(file, res.data.selfLink);
  } catch (err) {
    console.error('Error check status');
    throw err;
  }
}

async function checkStatus(file, url) {
  logger.debug(`Checking file import ${file}: ${url}`);
  while (true) {
    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const res = await client.request({ url });
    if (res.data.status === 'PENDING' || res.data.status === 'RUNNING') {
      logger.debug(res.data.status);
      await timeout(5);
      continue;
    } else if (res.data.status === 'DONE') {
      logger.debug('Done');
      break;
    } else {
      logger.debug(res.data.status);
      throw new Error(`Error status not supported (${res.data.status})`);
    }
  }
}

export async function importData(options) {
  const columns = ['lat', 'lon', 'pos', 'cell', 'timestamp'];
  if (options.heatmap) {
    columns.push('htime');
  }
  if (options.extraColumns) {
    options.extraColumns.forEach((c) => {
      if (columns.indexOf(c) === -1) {
        columns.push(c);
      }
    });
  }
  for (let i = 0; i <= options.maxZoom; i++) {
    let j = 0;
    while (true) {
      const file = `gs://${options.target.tmpStorage.bucket}${
        options.target.tmpStorage.dir ? `/${options.target.tmpStorage.dir}` : ''
      }/${i}.csv`;
      try {
        await importFile(
          file,
          options.target.database.projectId,
          options.target.database.instanceId,
          options.target.database.database,
          `"${options.name}_z${i}"`,
          columns,
        );
        logger.debug('Imported successfully');
        break;
      } catch (err) {
        logger.error(err);
        if (err && err.response && err.response.status === 409) {
          logger.debug(`Retrying file ${file} in 2 min`);
          await timeout(120);
        } else {
          logger.error(err);
          throw err;
        }
      } finally {
        j++;
      }
    }
  }
}
