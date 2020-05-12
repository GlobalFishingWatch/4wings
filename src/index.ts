import * as argsParser from 'args-parser';
function showHelp() {
  console.log(`
4Wings usage:
  tile-server: Run tile server
  generate-tiles: Run generate tiles of dataset
  import: Import data in dataset
  `);
}

async function init() {
  const configArgs = argsParser(process.argv);
  let module: any;
  if (configArgs.import) {
    module = await import('./importer/index');
    await module.start(configArgs);
    process.exit(0);
  } else if (configArgs['tile-server']) {
    module = await import('./tile-server/index');
    await module.start(configArgs);
  } else if (configArgs['generate-tiles']) {
    module = await import('./generate-tiles/index');
    await module.start(configArgs);
    process.exit(0);
  } else {
    showHelp();
    process.exit(1);
  }
}

init()
  .then(() => {
    console.log('Process executed successfully');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
