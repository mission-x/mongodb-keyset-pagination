import assert from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { EJSON } from 'bson';
import isDate from 'lodash.isdate';
import { MongoClient, ObjectId } from 'mongodb';
import type { Collection, Db, Document, Filter } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import KeySetPagination from './index.ts';
import type { KeySetFindOptions, SkipTokenContent } from './index.ts';
// @ts-ignore
import movieListJson from './sampleData/movies.json' with { type: 'json' };
import { getObjectIdToString, isObjectId } from './utils.ts';

const movieList = EJSON.deserialize(movieListJson);
const ratedMovieList = movieList.filter(
	(movie: Document) => typeof movie.rated !== 'undefined',
);
const unratedMovieList = movieList.filter(
	(movie: Document) => typeof movie.rated === 'undefined',
);

const DEFAULT_LIMIT = 10;
const ASSERTION_MAX_PAGINATED_RESULTS_LENGTH = 3; // 30 documents paginated with a limit of 10
const keySetPagination = new KeySetPagination();

let con: MongoClient;
let mongoServer: MongoMemoryServer;
let db: Db;
let col: Collection;

describe('KeySetPagination', () => {
	before(async () => {
		mongoServer = await MongoMemoryServer.create();
		con = await MongoClient.connect(mongoServer.getUri(), {});
		db = con.db(mongoServer.instanceInfo.dbName);
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
		it('paginates without sort (defaults)', async () => {
			const limit = DEFAULT_LIMIT;

			for (const filter of getCommonFilterList()) {
				const expectedPaginatedList = await getExpectedPaginatedList(
					filter,
					{
						limit,
						sort: { _id: 1 },
					},
					(lastDocument) => {
						return {
							...filter,
							_id: {
								$gt: lastDocument._id,
							},
						};
					},
				);

				const paginatedList = await getPaginatedList(filter, {
					limit,
				});

				assertPaginatedListEquality(expectedPaginatedList, paginatedList);
			}
		});
		it('paginates sorted by _id', async () => {
			const options = {
				limit: DEFAULT_LIMIT,
				sort: {
					_id: 1,
				},
			} as KeySetFindOptions;

			for (const filter of getCommonFilterList()) {
				const expectedPaginatedList = await getExpectedPaginatedList(
					filter,
					options,
					(lastDocument) => {
						return {
							...filter,
							_id: {
								$gt: lastDocument._id,
							},
						};
					},
				);

				const paginatedList = await getPaginatedList(filter, options);
				assertPaginatedListEquality(expectedPaginatedList, paginatedList);
			}
		});
		it('paginates sorted by _id descending', async () => {
			const options = {
				limit: DEFAULT_LIMIT,
				sort: {
					_id: -1,
				},
			} as KeySetFindOptions;

			for (const filter of getCommonFilterList()) {
				const expectedPaginatedList = await getExpectedPaginatedList(
					filter,
					options,
					(lastDocument) => {
						return {
							...filter,
							_id: {
								$lt: lastDocument._id,
							},
						};
					},
				);

				const paginatedList = await getPaginatedList(filter, options);
				assertPaginatedListEquality(expectedPaginatedList, paginatedList);
			}
		});
		it('paginates sorted by a single non-unique field', async () => {
			const limit = DEFAULT_LIMIT;

			for (const filter of getCommonFilterList()) {
				const expectedPaginatedList = await getExpectedPaginatedList(
					filter,
					{
						limit,
						sort: {
							title: 1,
							_id: 1,
						},
					},
					(lastDocument) => {
						return {
							...filter,
							$or: [
								{ title: { $gt: lastDocument.title } },
								{
									title: lastDocument.title,
									_id: { $gt: lastDocument._id },
								},
							],
						};
					},
				);

				const paginatedList = await getPaginatedList(filter, {
					limit,
					sort: {
						title: 1,
					},
				});

				assertPaginatedListEquality(expectedPaginatedList, paginatedList);
			}
		});
		it('paginates sorted by a single non-unique field, descending', async () => {
			const limit = DEFAULT_LIMIT;

			for (const filter of getCommonFilterList()) {
				const expectedPaginatedList = await getExpectedPaginatedList(
					filter,
					{
						limit,
						sort: {
							title: -1,
							_id: 1,
						},
					},
					(lastDocument) => {
						return {
							...filter,
							$or: [
								{ title: { $lt: lastDocument.title } },
								{
									title: lastDocument.title,
									_id: { $gt: lastDocument._id },
								},
							],
						};
					},
				);

				const paginatedList = await getPaginatedList(filter, {
					limit,
					sort: {
						title: -1,
					},
				});
				assertPaginatedListEquality(expectedPaginatedList, paginatedList);
			}
		});
		it('paginates sorted by a single non-unique field that repeats between paginated results', async () => {
			const limit = DEFAULT_LIMIT;

			for (const filter of getCommonFilterList()) {
				const expectedPaginatedList = await getExpectedPaginatedList(
					filter,
					{
						limit,
						sort: {
							runtime: 1,
							_id: 1,
						},
					},
					(lastDocument) => {
						return {
							...filter,
							$or: [
								{ runtime: { $gt: lastDocument.runtime } },
								{
									runtime: lastDocument.runtime,
									_id: { $gt: lastDocument._id },
								},
							],
						};
					},
				);

				const paginatedList = await getPaginatedList(filter, {
					limit,
					sort: {
						runtime: 1,
					},
				});

				assertPaginatedListEquality(expectedPaginatedList, paginatedList);
			}
		});
		it('paginates sorted by a single non-unique field that repeats between paginated results, descending', async () => {
			const limit = DEFAULT_LIMIT;

			for (const filter of getCommonFilterList()) {
				const expectedPaginatedList = await getExpectedPaginatedList(
					filter,
					{
						limit,
						sort: {
							runtime: -1,
							_id: 1,
						},
					},
					(lastDocument) => {
						return {
							...filter,
							$or: [
								{ runtime: { $lt: lastDocument.runtime } },
								{
									runtime: lastDocument.runtime,
									_id: { $gt: lastDocument._id },
								},
							],
						};
					},
				);

				const paginatedList = await getPaginatedList(filter, {
					limit,
					sort: {
						runtime: -1,
					},
				});

				assertPaginatedListEquality(expectedPaginatedList, paginatedList);
			}
		});
		it('paginates sorted by multiple fields (recursion)', async () => {
			const limit = DEFAULT_LIMIT;

			for (const filter of [{}]) {
				const expectedPaginatedList = await getExpectedPaginatedList(
					filter,
					{
						limit,
						sort: {
							year: 1,
							'imdb.rating': 1,
							_id: 1,
						},
					},
					(lastDocument) => {
						return {
							...filter,
							$or: [
								{ year: { $gt: lastDocument.year } },
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
											_id: { $gt: lastDocument._id },
										},
									],
								},
								{
									year: lastDocument.year,
									'imdb.rating': lastDocument.imdb.rating,
									_id: { $gt: lastDocument._id },
								},
							],
						};
					},
				);

				const paginatedList = await getPaginatedList(filter, {
					limit,
					sort: {
						year: 1,
						'imdb.rating': 1,
					},
				});

				assertPaginatedListEquality(expectedPaginatedList, paginatedList);
			}
		});
	});

	describe('Stressing the tie break logic', () => {
		it('paginates with 3 sorted fields, with 2 of them repeating between paginated results', async () => {
			const limit = 4;
			const filter = {
				'awards.wins': {
					$gte: 1,
				},
			};

			const expectedPaginatedListA = await getExpectedPaginatedList(
				filter,
				{
					limit,
					sort: {
						rated: -1,
						'awards.wins': 1,
						year: 1,
						_id: 1,
					},
				},
				(lastDocument) => {
					const ratedOrItem =
						typeof lastDocument.rated === 'undefined'
							? {}
							: { rated: { $lt: lastDocument.rated } };

					return {
						...filter,
						$or: [
							ratedOrItem,
							{
								rated: lastDocument.rated ?? null,
								$or: [
									{
										'awards.wins': {
											$gt: lastDocument.awards.wins,
										},
									},
									{
										'awards.wins': lastDocument.awards.wins,
										$or: [
											{
												year: {
													$gt: lastDocument.year,
												},
											},
											{
												year: lastDocument.year,
												_id: { $gt: lastDocument._id },
											},
										],
									},
								],
							},
						],
					};
				},
			);

			const paginatedListA = await getPaginatedList(filter, {
				limit,
				sort: {
					rated: -1,
					'awards.wins': 1,
					year: 1,
				},
			});

			assertPaginatedListEquality(expectedPaginatedListA, paginatedListA);

			const expectedPaginatedListB = await getExpectedPaginatedList(
				filter,
				{
					limit,
					sort: {
						rated: 1,
						'awards.wins': 1,
						year: -1,
						_id: 1,
					},
				},
				(lastDocument) => {
					const ratedOrItem =
						typeof lastDocument.rated === 'undefined'
							? {
									rated: {
										$exists: true,
										$ne: null,
									},
								}
							: { rated: { $gt: lastDocument.rated } };

					return {
						...filter,
						$or: [
							ratedOrItem,
							{
								rated: lastDocument.rated ?? null,
								$or: [
									{
										'awards.wins': {
											$gt: lastDocument.awards.wins,
										},
									},
									{
										'awards.wins': lastDocument.awards.wins,
										$or: [
											{
												year: {
													$lt: lastDocument.year,
												},
											},
											{
												year: lastDocument.year,
												_id: { $gt: lastDocument._id },
											},
										],
									},
								],
							},
						],
					};
				},
			);

			const paginatedListB = await getPaginatedList(filter, {
				limit,
				sort: {
					rated: 1,
					'awards.wins': 1,
					year: -1,
				},
			});

			assertPaginatedListEquality(expectedPaginatedListB, paginatedListB);
		});

		it('paginates with 3 sorted fields, with all 3 of them repeating between paginated results', async () => {
			const limit = 4;
			const filter = {
				'awards.wins': {
					$gte: 1,
				},
			};

			const expectedPaginatedList = await getExpectedPaginatedList(
				filter,
				{
					limit,
					sort: {
						rated: -1,
						'awards.wins': 1,
						type: 1,
						_id: -1,
					},
				},
				(lastDocument) => {
					const ratedOrItem =
						typeof lastDocument.rated === 'undefined'
							? {}
							: { rated: { $lt: lastDocument.rated } };

					return {
						...filter,
						$or: [
							ratedOrItem,
							{
								rated: lastDocument.rated ?? null,
								$or: [
									{
										'awards.wins': {
											$gt: lastDocument.awards.wins,
										},
									},
									{
										'awards.wins': lastDocument.awards.wins,
										$or: [
											{
												type: {
													$gt: lastDocument.type,
												},
											},
											{
												type: lastDocument.type,
												_id: { $lt: lastDocument._id },
											},
										],
									},
								],
							},
						],
					};
				},
			);

			const paginatedList = await getPaginatedList(filter, {
				limit,
				sort: {
					rated: -1,
					'awards.wins': 1,
					type: 1,
					_id: -1,
				},
			});

			assertPaginatedListEquality(expectedPaginatedList, paginatedList);
		});
	});

	describe('Paginate with undefined document properties', () => {
		before(async () => {
			await db.collection('unrated').insertMany(
				[
					...unratedMovieList.slice(0, 6),
					...ratedMovieList.slice(0, 2),
					...unratedMovieList.slice(6, 12),
					...ratedMovieList.slice(2, 4),
					...unratedMovieList.slice(12),
				]
					.slice(0, 30)
					.map(({ _id, title, rated }: Document) =>
						typeof rated === 'undefined'
							? { _id, title }
							: {
									_id,
									title,
									rated,
								},
					),
			);
		});

		it('paginates ascending, from undefined values to defined', async () => {
			const limit = DEFAULT_LIMIT;
			const filter = {};

			const expectedPaginatedList = await getExpectedPaginatedList(
				filter,
				{
					limit,
					sort: {
						rated: 1,
						_id: 1,
					},
				},
				(lastDocument) => {
					return {
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
								},
							},
						],
					};
				},
				{ collectionName: 'unrated' },
			);

			const paginatedList = await getPaginatedList(
				filter,
				{
					limit,
					sort: {
						rated: 1,
					},
				},
				null,
				[],
				{ collectionName: 'unrated' },
			);

			assertPaginatedListEquality(expectedPaginatedList, paginatedList);
		});
		it('paginates descending, from defined values to undefined', async () => {
			const limit = DEFAULT_LIMIT;
			const filter = {};

			const expectedPaginatedList = await getExpectedPaginatedList(
				filter,
				{
					limit,
					sort: {
						rated: -1,
						_id: 1,
					},
				},
				(lastDocument) => {
					return {
						...filter,
						$or: [
							{
								rated: null,
								_id: {
									$gt: lastDocument._id,
								},
							},
						],
					};
				},
				{ collectionName: 'unrated' },
			);

			const paginatedList = await getPaginatedList(
				filter,
				{
					limit,
					sort: {
						rated: -1,
					},
				},
				null,
				[],
				{ collectionName: 'unrated' },
			);

			assertPaginatedListEquality(expectedPaginatedList, paginatedList);
		});
	});

	describe('Paginate with $or in the query', () => {
		it('paginates with only $or', async () => {
			const limit = DEFAULT_LIMIT;
			const filter = {
				$or: [
					{
						genres: 'Drama',
					},
					{
						rated: 'PASSED',
					},
				],
			};

			const expectedPaginatedList = await getExpectedPaginatedList(
				filter,
				{
					limit,
					sort: {
						year: 1,
						_id: 1,
					},
				},
				(lastDocument) => {
					return {
						$and: [
							filter,
							{
								$or: [
									{ year: { $gt: lastDocument.year } },
									{
										year: lastDocument.year,
										_id: { $gt: lastDocument._id },
									},
								],
							},
						],
					};
				},
			);

			const paginatedList = await getPaginatedList(filter, {
				limit,
				sort: {
					year: 1,
				},
			});

			assertPaginatedListEquality(expectedPaginatedList, paginatedList);
		});
		it('paginates with $or along with equality', async () => {
			const limit = DEFAULT_LIMIT;
			const filter = {
				year: 1915,
				$or: [
					{
						genres: 'Drama',
					},
					{
						rated: 'passed',
					},
				],
			};

			const expectedPaginatedList = await getExpectedPaginatedList(filter, {
				limit,
				sort: {
					year: 1,
					_id: 1,
				},
			});

			const paginatedList = await getPaginatedList(filter, {
				limit,
				sort: {
					year: 1,
				},
			});

			assertPaginatedListEquality(expectedPaginatedList, paginatedList);
		});
	});
});

async function getExpectedPaginatedList(
	filter: Filter<unknown>,
	options: KeySetFindOptions,
	paginatedFilterFn?: (lastDocument: Document) => {
		[key: string]: unknown;
	},
	testOptions: { collectionName?: string } = {},
) {
	const maxLimit = ASSERTION_MAX_PAGINATED_RESULTS_LENGTH * options.limit;
	const { collectionName } = testOptions;
	const collection = db.collection(collectionName ?? 'test');
	const dbDocumentList = await collection
		.find(filter, {
			...options,
			limit: maxLimit,
		})
		.toArray();
	const expectedPaginatedList = [];

	for (let i = 0; i < maxLimit; i = i + options.limit) {
		const lastDocument = dbDocumentList[i - 1];
		if (i === 0 || lastDocument) {
			const paginatedFilter =
				i === 0 ? filter : paginatedFilterFn(lastDocument);
			const paginatedResultList = await collection
				.find(paginatedFilter, options)
				.toArray();
			expectedPaginatedList.push(paginatedResultList);
		}
	}

	return expectedPaginatedList;
}

async function getPaginatedList(
	filter: Filter<unknown>,
	options: KeySetFindOptions,
	skipTokenContent?: SkipTokenContent,
	currentPaginatedList = [],
	testOptions: {
		collectionName?: string;
	} = {},
) {
	const { collectionName } = testOptions;
	const collection = db.collection(collectionName ?? 'test');
	const { paginatedFilter, paginatedSort, paginatedLimit, getSkipContent } =
		keySetPagination.getPaginatedQuery(filter, skipTokenContent, options);

	const paginatedDocumentList = await collection
		.find(paginatedFilter, {
			sort: paginatedSort,
			limit: paginatedLimit,
		})
		.toArray();

	currentPaginatedList.push(paginatedDocumentList);
	const skipContent = getSkipContent(paginatedDocumentList);

	return !skipContent ||
		currentPaginatedList.length >= ASSERTION_MAX_PAGINATED_RESULTS_LENGTH
		? currentPaginatedList
		: getPaginatedList(
				filter,
				options,
				skipContent,
				currentPaginatedList,
				testOptions,
			);
}

function assertPaginatedListEquality(
	expectedPaginatedList: Document[][],
	paginatedList: Document[][],
	message?: string,
) {
	assert.equal(expectedPaginatedList.length > 0, true, message);
	assert.equal(expectedPaginatedList.length, paginatedList.length, message);

	const expectedLastPaginatedListIndex = expectedPaginatedList.length - 1;
	const expectedLastPaginatedList =
		expectedPaginatedList[expectedLastPaginatedListIndex];
	const expectedLastPaginatedDocumentIndex =
		expectedLastPaginatedList.length - 1;

	assert.deepEqual(expectedPaginatedList[0][0], paginatedList[0][0], message); // Assert first
	assert.deepEqual(
		expectedPaginatedList[expectedLastPaginatedListIndex][
			expectedLastPaginatedDocumentIndex
		],
		paginatedList[expectedLastPaginatedListIndex][
			expectedLastPaginatedDocumentIndex
		],
		message,
	); // Assert last

	expectedPaginatedList.forEach((expectedList, i) => {
		expectedList.forEach((document, j) => {
			assert.equal(
				getObjectIdToString(document._id),
				getObjectIdToString(paginatedList[i][j]._id),
				message,
			);
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
			_id: movieList[2]._id,
		},
		{
			// Simple string equality
			rated: 'APPROVED',
		},
		{
			// Simple number equality
			year: 1941,
		},
		{
			// Nested object equality no match
			imdb: {
				rating: 7.9,
			},
		},
		{
			// Nested object equality match
			imdb: {
				rating: 7.9,
				votes: 162,
				id: 25478,
			},
		},
		{
			// Nested object equality with dot notation
			'imdb.rating': 7.4,
		},
		{
			// Range 40s
			year: {
				$gte: 1940,
				$lte: 1949,
			},
		},
		{
			// Date
			released: {
				$gt: new Date('1913-11-24T00:00:00.000Z'),
			},
		},
	];
}
