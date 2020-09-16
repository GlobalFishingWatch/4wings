import { run } from './core/orchestrator';

function printUsage() {
  console.log(`
Import command:
  Required arguments:
  --url=<Url of the config file>
  --date=<Date to execute>
  Optional arguments:
  --token=<Auth token to obtain the config file> (optional)
  `);
}

export async function start(args, overrideConfig) {
  if (!args.url || !args.date) {
    printUsage();
    process.exit(1);
  }
  await run(args.url, new Date(args.date), args.token, overrideConfig);
}
