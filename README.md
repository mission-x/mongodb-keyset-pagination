# MongoDB KeySet Pagination

## Known Limitations

### MongoDB sort option expects only an object

Although the MongoDB NodeJS driver supports [multiple types for sorting](https://mongodb.github.io/node-mongodb-native/6.16/types/Sort.html),
we have kept things simple and expect only a type of object `{[key: string]: SortDirection}`. This can be easily extended in the future as needed.

### Sorting by an array field not supported

Due to complexity and the need to use an [aggregate sorting pipeline](https://www.mongodb.com/docs/manual/reference/operator/aggregation/sort/#sort-by-an-array-field),
sorting by an array field is not supported.

### Potentially empty list as the last paginated result

The documents are not being counted to know when all documents have been exhausted, we simply check if the length of the paginated list is less than the paginated limit.
This means that if by coincidence the last paginated document list has the same length as the paginated limit, then a next token will be provided that will result in an empty list when queried.  
