import { run } from './core/orchestrator';

function printUsage() {
  console.log(`
Import command:
  Required arguments:
  --url=<Url of the config file>
  --date=<Date to execute>
  --period=<Period to import the data (daily, monthly, yearly)>
  Optional arguments:
  --token=<Auth token to obtain the config file> (optional)
  `);
}

export async function start(args) {
  if (!args.url || !args.date || !args.period) {
    printUsage();
    process.exit(1);
  }
  await run(args.url, args.date, args.period, args.token);
}
