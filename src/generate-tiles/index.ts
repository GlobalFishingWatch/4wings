import { run } from './core/orchestrator';

function printUsage() {
  console.log(`
Import command:
  Required arguments: 
  --url=<Url of the config file>
  Optional arguments:
  --token=<Auth token to obtain the config file> (optional)
  `);
}

export async function start(args) {
  if (!args.url) {
    printUsage();
    process.exit(1);
  }
  await run(args.url, args.token);
}
