# CSV Writer

Write data from the stream to csv files. It will generate `maxZoom+1` CSV files with name `<zoom>.csv`.
The writer will add the keys defined in the extraColumns key of the configuration file.

## Configuration

To use this writer, you need to config in the `target` key of the configuration file the next information:

* type: `csv`
* path: Directory where the process will generate the csv files.

### Example 

```json

{
    "type": "csv",
    "path": "./mycsvs",
}


```

