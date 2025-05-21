import {describe, it, before, after} from 'node:test';
import assert from 'node:assert';
import {MongoClient, ObjectId} from 'mongodb';
import {EJSON} from 'bson';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {getPaginatedQuery} from "./paginationQuery.ts";
import {getObjectIdToString, isObjectId} from "./utils.ts";
import type {KeySetFindOptions, SkipTokenContent, KeySetSort} from "./paginationQuery.ts";
import type {Collection, Db, Filter, Document} from 'mongodb';
import isDate from "lodash.isdate";
// @ts-ignore
import movieListJson from './sampleData/movies.json' with {type: 'json'};

const movieList = EJSON.deserialize(movieListJson);
const ratedMovieList = movieList.filter((movie: Document) => typeof movie.rated !== 'undefined');
const unratedMovieList = movieList.filter((movie: Document) => typeof movie.rated === 'undefined');
const DEFAULT_LIMIT = 10;
const ASSERTION_MAX_PAGINATED_RESULTS_LENGTH = 3; // 30 documents paginated with a limit of 10

let con: MongoClient;
let mongoServer: MongoMemoryServer;
let db: Db;
let col: Collection;

describe('tests', () => {

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        con = await MongoClient.connect(mongoServer.getUri(), {});
        db = con.db(mongoServer.instanceInfo!.dbName);
        col = db.collection('test');
        await col.insertMany(EJSON.deserialize(movieListJson));
    });

    after(async () => {
        if (con) {
            await con.close();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    it('sanity checks the setup is correct', async () => {
        const movie = await col.findOne({});
        assert.equal(isObjectId(movie._id), true);
        assert.equal(typeof movie.runtime === 'number', true);
        assert.equal(typeof movie.title === 'string', true);
        assert.equal(typeof movie.rated === 'string', true);
        assert.equal(isDate(movie.released), true);
        assert.equal(typeof movie.imdb.rating === 'number', true);
        assert.equal(Array.isArray(movie.genres), true);
    });

    describe('Pagination common use cases', () => {
        it(`paginates without sort (defaults)`, async () => {
            const limit = DEFAULT_LIMIT;

            for (let filter of getCommonFilterList()) {
                const expectedPaginatedList = await getExpectedPaginatedList(filter, {
                    limit,
                    sort: {_id: 1}
                }, (lastDocument) => {
                    return {
                        ...filter,
                        _id: {
                            $gt: lastDocument._id,
                        },
                    };
                });

                const paginatedList = await getPaginatedList(filter, {
                    limit,
                });

                assertPaginatedListEquality(expectedPaginatedList, paginatedList);
            }
        });
        it(`paginates sorted by _id`, async () => {
            const options = {
                limit: DEFAULT_LIMIT,
                sort: {
                    _id: 1
                }
            } as KeySetFindOptions;

            for (let filter of getCommonFilterList()) {
                const expectedPaginatedList = await getExpectedPaginatedList(filter, options, (lastDocument) => {
                    return {
                        ...filter,
                        _id: {
                            $gt: lastDocument._id,
                        },
                    };
                });

                const paginatedList = await getPaginatedList(filter, options);
                assertPaginatedListEquality(expectedPaginatedList, paginatedList);
            }
        });
        it(`paginates sorted by _id descending`, async () => {
            const options = {
                limit: DEFAULT_LIMIT,
                sort: {
                    _id: -1
                }
            } as KeySetFindOptions;

            for (let filter of getCommonFilterList()) {
                const expectedPaginatedList = await getExpectedPaginatedList(filter, options, (lastDocument) => {
                    return {
                        ...filter,
                        _id: {
                            $lt: lastDocument._id,
                        },
                    };
                });

                const paginatedList = await getPaginatedList(filter, options);
                assertPaginatedListEquality(expectedPaginatedList, paginatedList);
            }
        });
        it(`paginates sorted by a single non-unique field`, async () => {
            const limit = DEFAULT_LIMIT;

            for (let filter of getCommonFilterList()) {
                const expectedPaginatedList = await getExpectedPaginatedList(filter, {
                    limit,
                    sort: {
                        title: 1,
                        _id: 1,
                    }
                }, (lastDocument) => {
                    return {
                        ...filter,
                        $or: [
                            {title: {$gt: lastDocument.title}},
                            {
                                title: lastDocument.title,
                                _id: {$gt: lastDocument._id},
                            },
                        ],
                    };
                });

                const paginatedList = await getPaginatedList(filter, {
                    limit,
                    sort: {
                        title: 1,
                    }
                });

                assertPaginatedListEquality(expectedPaginatedList, paginatedList);
            }
        });
        it(`paginates sorted by a single non-unique field, descending`, async () => {
            const limit = DEFAULT_LIMIT;

            for (let filter of getCommonFilterList()) {
                const expectedPaginatedList = await getExpectedPaginatedList(filter, {
                    limit,
                    sort: {
                        title: -1,
                        _id: 1,
                    }
                }, (lastDocument) => {
                    return {
                        ...filter,
                        $or: [
                            {title: {$lt: lastDocument.title}},
                            {
                                title: lastDocument.title,
                                _id: {$gt: lastDocument._id},
                            },
                        ],
                    };
                });

                const paginatedList = await getPaginatedList(filter, {
                    limit,
                    sort: {
                        title: -1,
                    }
                });
                assertPaginatedListEquality(expectedPaginatedList, paginatedList);
            }
        });
        it(`paginates sorted by a single non-unique field that repeats between paginated results`, async () => {
            const limit = DEFAULT_LIMIT;

            for (let filter of getCommonFilterList()) {
                const expectedPaginatedList = await getExpectedPaginatedList(filter, {
                    limit,
                    sort: {
                        runtime: 1,
                        _id: 1,
                    }
                }, (lastDocument) => {
                    return {
                        ...filter,
                        $or: [
                            {runtime: {$gt: lastDocument.runtime}},
                            {
                                runtime: lastDocument.runtime,
                                _id: {$gt: lastDocument._id},
                            },
                        ],
                    };
                });

                const paginatedList = await getPaginatedList(filter, {
                    limit,
                    sort: {
                        runtime: 1,
                    }
                });

                assertPaginatedListEquality(expectedPaginatedList, paginatedList);
            }
        });
        it(`paginates sorted by a single non-unique field that repeats between paginated results, descending`, async () => {
            const limit = DEFAULT_LIMIT;

            for (let filter of getCommonFilterList()) {
                const expectedPaginatedList = await getExpectedPaginatedList(filter, {
                    limit,
                    sort: {
                        runtime: -1,
                        _id: 1,
                    }
                }, (lastDocument) => {
                    return {
                        ...filter,
                        $or: [
                            {runtime: {$lt: lastDocument.runtime}},
                            {
                                runtime: lastDocument.runtime,
                                _id: {$gt: lastDocument._id},
                            },
                        ],
                    };
                });

                const paginatedList = await getPaginatedList(filter, {
                    limit,
                    sort: {
                        runtime: -1,
                    }
                });

                assertPaginatedListEquality(expectedPaginatedList, paginatedList);
            }
        });
        it(`paginates sorted by multiple fields (recursion)`, async () => {
            const limit = DEFAULT_LIMIT;

            for (let filter of getCommonFilterList()) {
                const expectedPaginatedList = await getExpectedPaginatedList(filter, {
                    limit,
                    sort: {
                        year: 1,
                        'imdb.rating': 1,
                        _id: 1,
                    }
                }, (lastDocument) => {
                    return {
                        ...filter,
                        $or: [
                            {year: {$gt: lastDocument.year}},
                            {
                                year: lastDocument.year,
                                $or: [
                                    {
                                        'imdb.rating': {
                                            $gt: lastDocument.imdb.rating,
                                        },
                                    },
                                    {
                                        'imdb.rating': lastDocument.imdb.rating,
                                        _id: {$gt: lastDocument._id},
                                    },
                                ],
                            },
                            {
                                year: lastDocument.year,
                                'imdb.rating': lastDocument.imdb.rating,
                                _id: {$gt: lastDocument._id},
                            },
                        ],
                    };
                });

                const paginatedList = await getPaginatedList(filter, {
                    limit,
                    sort: {
                        year: 1,
                        'imdb.rating': 1,
                    }
                });

                assertPaginatedListEquality(expectedPaginatedList, paginatedList);
            }
        });
    });

    describe('Paginate with undefined document properties', () => {

        before(async () => {
            await db.collection('unrated').insertMany([
                ...unratedMovieList.slice(0, 6),
                ...ratedMovieList.slice(0, 2),
                ...unratedMovieList.slice(6, 12),
                ...ratedMovieList.slice(2, 4),
                ...unratedMovieList.slice(12),
            ].slice(0, 30).map(({_id, title, rated}: Document) => typeof rated === 'undefined' ? {_id, title} : {
                _id, title, rated
            }));
        });

        it('paginates ascending, from undefined values to defined', async () => {
            const limit = DEFAULT_LIMIT;
            const filter = {};

            const expectedPaginatedList = await getExpectedPaginatedList(filter, {
                limit,
                sort: {
                    rated: 1,
                    _id: 1,
                }
            }, (lastDocument) => {
                return typeof lastDocument.rated === 'undefined' || lastDocument.rated === null
                    ? {
                        ...filter,
                        $or: [
                            {
                                rated: {
                                    $exists: true,
                                    $ne: null,
                                },
                            },
                            {
                                rated: null,
                                _id: {
                                    $gt: lastDocument._id,
                                }
                            }
                        ]
                    }
                    : {
                        ...filter,
                        $or: [
                            {rated: {$gt: lastDocument.rated}},
                            {
                                rated: lastDocument.rated,
                                _id: {$gt: lastDocument._id},
                            },
                        ],
                    };
            }, {collectionName: 'unrated'});

            const paginatedList = await getPaginatedList(filter, {
                limit,
                sort: {
                    rated: 1,
                }
            }, null, [], {collectionName: 'unrated'});

            assertPaginatedListEquality(expectedPaginatedList, paginatedList);
        });

        it('paginates descending, from defined values to undefined', async () => {
            const limit = DEFAULT_LIMIT;
            const filter = {};

            const expectedPaginatedList = await getExpectedPaginatedList(filter, {
                limit,
                sort: {
                    rated: -1,
                    _id: 1,
                }
            }, (lastDocument) => {
                return typeof lastDocument.rated === 'undefined' || lastDocument.rated === null
                    ? {
                        ...filter,
                        $or: [{
                            rated: null,
                            _id: {
                                $gt: lastDocument._id,
                            }
                        }]
                    }
                    : {
                        ...filter,
                        $or: [
                            {rated: {$lt: lastDocument.rated}},
                            {
                                rated: lastDocument.rated,
                                _id: {$gt: lastDocument._id},
                            },
                        ],
                    };
            }, {collectionName: 'unrated'});

            const paginatedList = await getPaginatedList(filter, {
                limit,
                sort: {
                    rated: -1,
                }
            }, null, [], {collectionName: 'unrated'});

            assertPaginatedListEquality(expectedPaginatedList, paginatedList);
        });
    });

    describe('Paginate with sorting within an array', () => {
        it('paginates an array of primitives', () => {
            assert.ok(true);
        });
        it('paginates an array of objects', () => {
            assert.ok(true);
        });
    });

    describe('Build paginated query with expected skip value types', () => {
        it('paginates with skip value of type Date', () => {
            assert.ok(true);
        });

        it('paginates with skip value of type ObjectId', () => {
            assert.ok(true);
        });
    });

    // describe('Custom encryption methods', () => {
    //     it('encrypts and decrypts by provided custom encryption methods', () => {
    //         assert.ok(true);
    //     });
    // });
    //
    // describe('Custom date parser', () => {
    //     it('paginates on dates by utilizing a provided custom date parser', () => {
    //         assert.ok(true);
    //     });
    // });
});

async function getExpectedPaginatedList(filter: Filter<any>, options: KeySetFindOptions, paginatedFilterFn: (lastDocument: Document) => {
    [key: string]: any
}, testOptions: { collectionName?: string } = {}) {
    const maxLimit = ASSERTION_MAX_PAGINATED_RESULTS_LENGTH * options.limit;
    const {collectionName} = testOptions;
    const collection = db.collection(collectionName ?? 'test');
    const dbDocumentList = await collection.find(filter, {
        ...options,
        limit: maxLimit
    }).toArray();
    const expectedPaginatedList = [];

    for (let i = 0; i < maxLimit; i = i + options.limit) {
        let lastDocument = dbDocumentList[i - 1];
        if (i === 0 || lastDocument) {
            let paginatedFilter = i === 0 ? filter : paginatedFilterFn(lastDocument);
            let paginatedResultList = await collection.find(paginatedFilter, options).toArray();
            expectedPaginatedList.push(paginatedResultList);
        }
    }

    return expectedPaginatedList;
}

async function getPaginatedList(filter: Filter<any>, options: KeySetFindOptions, skipTokenContent?: SkipTokenContent, currentPaginatedList = [], testOptions: {
    collectionName?: string
} = {}) {
    const {collectionName} = testOptions;
    const collection = db.collection(collectionName ?? 'test');
    const {
        paginatedFilter,
        paginatedSort,
        paginatedLimit,
        getSkipContent
    } = await getPaginatedQuery(
        filter,
        skipTokenContent,
        options
    );

    const paginatedDocumentList = await collection.find(
        paginatedFilter,
        {
            sort: paginatedSort,
            limit: paginatedLimit,
        }
    ).toArray();

    currentPaginatedList.push(paginatedDocumentList);
    const skipContent = getSkipContent(paginatedDocumentList);

    return !skipContent || currentPaginatedList.length >= ASSERTION_MAX_PAGINATED_RESULTS_LENGTH
        ? currentPaginatedList
        : getPaginatedList(filter, options, skipContent, currentPaginatedList, testOptions);
}

function assertPaginatedListEquality(expectedPaginatedList: Document[][], paginatedList: Document[][], message?: string) {
    assert.equal(expectedPaginatedList.length > 0, true, message);
    assert.equal(expectedPaginatedList.length, paginatedList.length, message);

    const expectedLastPaginatedListIndex = expectedPaginatedList.length - 1;
    const expectedLastPaginatedList = expectedPaginatedList[expectedLastPaginatedListIndex];
    const expectedLastPaginatedDocumentIndex = expectedLastPaginatedList.length - 1;

    assert.deepEqual(expectedPaginatedList[0][0], paginatedList[0][0], message); // Assert first
    assert.deepEqual(expectedPaginatedList[expectedLastPaginatedListIndex][expectedLastPaginatedDocumentIndex], paginatedList[expectedLastPaginatedListIndex][expectedLastPaginatedDocumentIndex], message); // Assert last

    expectedPaginatedList.forEach((expectedList, i) => {
        expectedList.forEach((document, j) => {
            assert.equal(getObjectIdToString(document._id), getObjectIdToString(paginatedList[i][j]._id), message);
        });
    });
}

function getCommonFilterList() {
    return [
        {
            // Everything
        },
        {
            // For some reason by an _id
            _id: movieList[2]._id
        },
        {
            // Simple string equality
            rated: 'APPROVED'
        },
        {
            // Simple number equality
            year: 1941
        },
        {
            // Nested object equality no match
            imdb: {
                rating: 7.9
            }
        },
        {
            // Nested object equality match
            imdb: {
                rating: 7.9,
                votes: 162,
                id: 25478
            }
        },
        {
            // Nested object equality with dot notation
            'imdb.rating': 7.4
        },
        {
            // Range 40s
            year: {
                $gte: 1940,
                $lte: 1949
            }
        }
    ];
}
