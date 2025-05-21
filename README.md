# MongoDB KeySet Pagination

## Known Limitations

### Sorting by an array field

Due to complexity and the need to use an [aggregate sorting pipeline](https://www.mongodb.com/docs/manual/reference/operator/aggregation/sort/#sort-by-an-array-field),
sorting by an array field is not supported.

### Potentially empty list as last paginated result

The documents are not being counted to know when all documents have been exhausted, we simply check if the length of the paginated list is less than the paginated limit.
This means that if by coincidence the last paginated document list has the same length as the paginated limit, then a next token will be provided that will result in an empty list when queried.  
