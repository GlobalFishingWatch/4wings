# BigQuery Reader

Read data from BigQuery (Google) to import into 4wings.



## Configuration

To use this reader, you need to config in the `source` key of the configuration file the next information:

* type: `bigquery`
* projectId: Id of the google project to run the query.
* query: SQL Query to obtain the data. You can use `ejs` to modify the query using the date and period fields of the execution.

### Query

You can use EJS to generate your query dinamically based in the date and the period arguments of the execution. Also you have available
the following helper functions:

* formatDate(date, format): Based in the [dateformat](https://www.npmjs.com/package/dateformat) npm package. Format the date param in the format specified

You have available the following variables:

* date: Execution date
* period: Period (daily, monthly, yearly)

Example of query:

```ejs
<%
let filterDate='';
if (period === 'daily'){
  filterDate = formatDate(date, 'yyyy-mm-dd');
} else if (period === 'monthly') {
  filterDate = formatDate(date, 'yyyy-mm-01');
} else if (period === 'yearly') {
  filterDate = formatDate(date, 'yyyy-01-01');
}
%>
select id, lat, lon, timestamp from table_<%=filterDate%>

```

### Example 

```json

{
    "type": "bigquery",
    "query": "select lat, lon, timestamp, id from mytable",
    "projectId": "my-project-id"
}


```

