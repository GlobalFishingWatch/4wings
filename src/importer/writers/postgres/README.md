# Postgres Writer

Write data from the stream to Postgres database. It will create the table (if they don't exist), insert the data using the `COPY` and create the cluster to improve the performance in the queries.

The process will also create a `datasets` table (if not exists) and include a row with metadata (name, options, minDate, maxDate) of the data imported.

## Configuration

To use this writer, you need to config in the `target` key of the configuration file the next information:

* type: `postgres`
* columnsDefinition: Object with the definitions of the extra columns to add to the data. The key is the key in the javascript object and the values is the Postgres type. Required field.
* database: Object with the connection information to the database:
  * user: User of the database
  * password: Password of the database
  * host: Host of the database
  * database: Name of the database
  * port: Port of the database.

### Example 

```json

{
    "type": "postgres",
    "columnsDefinition": {
      "id": "VARCHAR(100)"
    },
    "database": {
      "user": "postgres",
      "password": "postgres",
      "host": "localhost",
      "database": "postgres",
      "port": 5432
    }
}


```

