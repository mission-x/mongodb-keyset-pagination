[![Node.js CI](https://github.com/mission-x/mongodb-keyset-pagination/actions/workflows/node.js.yml/badge.svg)](https://github.com/mission-x/mongodb-keyset-pagination/actions/workflows/node.js.yml)

# MongoDB KeySet Pagination

Keyset pagination, also known as seek pagination, is a method of retrieving data from a database in pages.
Instead of using offsets, which can be inefficient for large datasets, keyset pagination uses a key, like a unique ID or timestamp, to determine the starting point for each page of data. This key represents a "cursor" that indicates the next set of records to retrieve.

Credits to [Mosius](https://medium.com/@mosius) for the motivation and a highly recommended read in order to understand the benefits and shortcomings of keyset pagination: [MongoDB Pagination, Fast & Consistent](https://medium.com/swlh/mongodb-pagination-fast-consistent-ece2a97070f3)


## Use

```
npm i mongodb-keyset-pagination
```

```js
// import KeySetPagination from 'mongodb-keyset-pagination';
const KeySetPagination = require('mongodb-keyset-pagination');
const keySetPagination = new KeySetPagination({
    defaultLimit: 10
});

const filter = { genres: 'Drama' };

const {
    paginatedFilter,
    paginatedSort,
    paginatedLimit,
    getSkipContent
} = keySetPagination.getPaginatedQuery(filter);

const movieList = await db.collection('movies')
    .find(paginatedFilter)
    .sort(paginatedSort)
    .limit(paginatedLimit)
    .toArray();

const skipContent = getSkipContent(movieList);

// Later...

const {
    paginatedFilter,
    paginatedSort,
    paginatedLimit,
    getSkipContent
} = keySetPagination.getPaginatedQuery(filter, skipContent);

const movieListNext = await db.collection('movies')
    .find(paginatedFilter)
    .sort(paginatedSort)
    .limit(paginatedLimit)
    .toArray();

```

## Alternatives

- Cursor based pagination: [mongo-cursor-pagination](https://github.com/mixmaxhq/mongo-cursor-pagination), [mongodb-cross-cursor](https://github.com/crisp-oss/node-mongodb-native-cross-cursor)
- [Skip-limit](https://www.mongodb.com/docs/manual/reference/method/cursor.skip/) pagination

### Why consider KeySet pagination then?

- Better performance than the skip-limit pagination, if multiple page traversals are expected.
- Does not create a layer of abstraction around the MongoDB or Mongoose driver, in comparison with the cursor based solutions.

## Known Limitations

### First, a word of caution

Although this solution will work well for simplistic needs and will support most of the complex ones as well,
if you are planning to implement complex sorting in your queries,
then you might potentially step into performance issues. This solution relies on generating recursive `$or` queries,
which means optimal indexing might become difficult to achieve the more you add sort fields to your queries.

```js
// If you find yourself doing this, then this solution might not be for you...
const result = keySetPagination.getPaginatedQuery({}, skipContent, {
    sort: {
        rating: 1,
        year: 1,
        type: 1,
        status: 1,
    }
});
```

### Sorting and the projection option

When sorting by a field, you will have to ensure that the field is returned as part of the document list.
This means you cannot project it out. For example, the below will lead to wrong paginated results:

```js
const {
    paginatedFilter,
    paginatedSort,
    paginatedLimit,
    getSkipContent
} = keySetPagination.getPaginatedQuery({}, skipContent, {
    sort: {
        name: 1 // Sort by the name field
    }
});

const movieListNext = await db.collection('movies')
    .find(paginatedFilter)
    .sort(paginatedSort)
    .limit(paginatedLimit)
    .project({
        name: -1 // Do not exclude the name field
    })
    .toArray();
```

### MongoDB sort option expects only an object

Although the MongoDB NodeJS driver supports [multiple types for sorting](https://mongodb.github.io/node-mongodb-native/6.16/types/Sort.html),
we have kept things simple and expect only a type of object `{[key: string]: SortDirection}`. This can be easily extended in the future as needed.

```js
const result = keySetPagination.getPaginatedQuery({}, skipContent, {
 sort: [
     // Not going to work
     ['title', 1]
 ]
});
```

### Sorting by an array field is not supported

Due to the complexity and the need to use an [aggregate sorting pipeline](https://www.mongodb.com/docs/manual/reference/operator/aggregation/sort/#sort-by-an-array-field),
sorting by an array field is not supported.

```js
// {
//     "title": "Port of Shadows", 
//     "genre": ["Drama", "Crime"]
// }

const result = keySetPagination.getPaginatedQuery({}, skipContent, {
 sort: {
  genre: 1 // Not going to work
 }
});
```

### Potentially empty list as the last paginated result

The documents are not being counted to know when all documents have been exhausted, we simply check if the length of the paginated list is less than the paginated limit.
This means that if by coincidence the last paginated document list has the same length as the paginated limit, then a next token will be provided that will result in an empty list when queried.  

## Utilizing the skip content

The `getSkipContent()` or `getSkipToken()` returns the necessary information to fetch the next paginated results.
The property `skipValues` of the skip content, includes the document `_id` and the values of the fields that you have chosen to sort by.

Depending on the sensitivity of your data and the fields you choose to sort by, there are different ways to work with the skip content,
in order to later fetch the next paginated results.

### Built-in token support

The `getSkipToken()` method can be utilized to receive an encrypted token.
It encrypts the skip content to a hex string, using the default `aes-192-cbc` algorithm, for a balance between security and performance.

```js
const keySetPagination = new KeySetPagination({
 encryptionKey: crypto.randomBytes((192/8)/2).toString('hex')
});
const { getSkipToken } = keySetPagination.getPaginatedQuery({});
const skipToken = getSkipToken(documentList);

res.json({
    value: [...],
    nextLink: `https://site.com/movies?skipToken=${skipToken}`,
});

keySetPagination.getPaginatedQuery({}, skipToken)
```

You can also change the algorithm:

```js
const keySetPagination = new KeySetPagination({
    encryptionAlgorithm: 'aes-256-cbc', 
    encryptionKey: crypto.randomBytes((256/8)/2).toString('hex'),
});
```

### Custom token

The encryption method is up to you, but the token generated should be opaque.

```js
const { EJSON } = require('bson');
const { getSkipContent } = keySetPagination.getPaginatedQuery({});
const skipContent = getSkipContent(documentList);
const skipToken = encrypt(EJSON.stringify(skipContent));

res.json({
    value: [...],
    nextLink: `https://site.com/movies?skipToken=${skipToken}`,
});

keySetPagination.getPaginatedQuery({}, EJSON.parse(decrypt(skipToken)))
```

### Store in a DB

You can store the result of the `getSkipContent()` into a DB and use the ID of the entry to share with the client.

```js
const skipContent = getSkipContent(movieList);
const { _id } = await db.collection('skipContent')
    .insertOne({ skipContent })
    .project({_id: 1});

res.json({
    value: [...],
    nextLink: `https://site.com/movies?skipToken=${_id}`,
});
```

### Important

If you don't store the `skipContent` into a MongoDB or you choose to convert to a string, **do not** use `JSON.stringify(skipContent)`,
as this will potentially change the value types. E.g. ObjectId and Date types will be converted to strings. Instead, utilize MongoDB's `EJSON`:

```js
const { EJSON } = require('bson');
const skipContent = getSkipContent(movieList);
const skipContentString = EJSON.stringify(skipContent);
const result = keySetPagination.getPaginatedQuery(filter, EJSON.parse(skipContentString));
```

## More Examples

### Sorting & indexing

### Generating tokens

### Pagination results exhausted

### Using Typescript
