const yargs = require('yargs/yargs');
function showHelp() {
  console.log(`
4Wings usage:
  tile-server: Run tile server
  generate-tiles: Run generate tiles of dataset
  import: Import data in dataset
  `);
}

function parseConfigArgs(args) {
  const keys = Object.keys(args)
    .filter((arg) => arg.startsWith('config.'))
    .map((arg) => arg.replace(/config\./, ''));
  const config = {};
  for (let i = 0; i < keys.length; i++) {
    const parts = keys[i].split('.');
    let partialConfig = config;
    for (let j = 0; j < parts.length; j++) {
      if (!partialConfig[parts[j]]) {
        partialConfig[parts[j]] = {};
      }
      if (j + 1 === parts.length) {
        partialConfig[parts[j]] = args[`config.${keys[i]}`];
      } else {
        partialConfig = partialConfig[parts[j]];
      }
    }
  }
  return config;
}

async function init() {
  const configArgs = yargs(process.argv.slice(2)).argv;
  const overrideConfig = parseConfigArgs(configArgs);
  let module: any;
  if (configArgs._[0] === 'import') {
    module = await import('./importer/index');
    await module.start(configArgs, overrideConfig);
    process.exit(0);
  } else if (configArgs._[0] === 'tile-server') {
    module = await import('./tile-server/index');
    await module.start(configArgs, overrideConfig);
  } else if (configArgs._[0] === 'generate-tiles') {
    module = await import('./generate-tiles/index');
    await module.start(configArgs, overrideConfig);
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
