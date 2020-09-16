const path = require('path');
require('ts-node').register();
const tsConfig = require('../../../../tsconfig.json');
const tsConfigPaths = require('tsconfig-paths');

tsConfigPaths.register({
  baseUrl: tsConfig.compilerOptions.baseUrl,
  paths: tsConfig.compilerOptions.paths,
});
try {
  require(path.resolve(__dirname, './worker.ts'));
} catch (err) {
  console.error(err);
}
