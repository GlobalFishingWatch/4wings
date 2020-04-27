# 4wings - Generate tiles

With this app, you can pregenerate tiles of a dataset and serve them in the tile server.

Now the tile server only supports Google Cloud Storage to save the pregenerated tiles.

## Documentation

If you want to pregenerate the tiles using this app, you need configure the `cache` key in your configuration file.

The cache key is a objet with the following configuration:

- bucket: Name of the bucket where the app will upload the tiles generated.
- dir: Directory in the bucket where upload the tiles.
- projectId: Id of the project where the bucket belongs.

Remember to do public the bucket, if not the tile server can't use it.

Important! The generate-tile app will remove all files contained in the gs://<bucket>/dir

Example:

```json
{
  "bucket": "my-bucket",
  "dir": "tiles",
  "projectId": "my-project-id"
}
```

## TODO

- [ ] Generate tiles from different sources.
