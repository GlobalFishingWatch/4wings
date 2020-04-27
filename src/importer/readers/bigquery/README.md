# BigQuery Reader

Read data from BigQuery (Google) to import into 4wings.

TODO: Improve doc of variables and function available in ejs

## Configuration

To use this reader, you need to config in the `source` key of the configuration file the next information:

* type: `bigquery`
* projectId: Id of the google project to run the query.
* query: SQL Query to obtain the data. You can use `ejs` to modify the query using the date and period fields of the execution.

### Example 

```json

{
    "type": "bigquery",
    "query": "select lat, lon, timestamp, id from mytable",
    "projectId": "my-project-id"
}


```

