import { run } from './core/orchestrator';

function printUsage() {
  console.log(`
Import command:
  Required arguments:
  --url=<Url of the config file>
  --config-encoded=<base64 with config content>
  --date=<Date to execute>
  --period=<Period to import the data (daily, monthly, yearly)>
  Optional arguments:
  --token=<Auth token to obtain the config file> (optional)
  --threads=<numThreads>
  `);
}

export async function start(args, overrideConfig) {
  if (
    (args.url && args['config-encoded']) ||
    (!args.url && !args['config-encoded']) ||
    !args.date
  ) {
    printUsage();
    process.exit(1);
  }
  args.configEncoded = args['config-encoded'];
  delete args['config-encoded'];
  await run(args, overrideConfig);
}
