import type { ObjectIdLike } from 'bson';
import type { Document, Filter, FindOptions, SortDirection } from 'mongodb';
import crypto from 'node:crypto';
import { EJSON } from 'bson';

export type SkipValue =
	| string
	| number
	| boolean
	| bigint
	| Date
	| ObjectIdLike
	| null;

export interface SkipValues {
	[key: string]: SkipValue | null;
}

export interface KeySetSort {
	[key: string]: SortDirection;
}

export interface SkipContent {
	sort: KeySetSort;
	limit: number;
	skipValues: SkipValues;
}

export interface KeySetFindOptions extends FindOptions {
	sort?: KeySetSort;
}

export interface PaginatedQuery<TSchema> {
	paginatedFilter: Filter<TSchema>;
	paginatedSort: KeySetSort;
	paginatedLimit: number;
	getSkipContent(documentList: Document[]): SkipContent;
	getSkipToken(documentList: Document[]): string;
}

export interface KeySetPaginationOptions {
	defaultLimit?: number;
	encryptionKey?: string;
	encryptionAlgorithm?: string;
}

export default class KeySetPagination {
	public options: KeySetPaginationOptions;

	constructor(options: KeySetPaginationOptions = {}) {
		this.options = {
			defaultLimit: 10,
			encryptionAlgorithm: 'aes-192-cbc',
			...options,
		};
	}

	getPaginatedQuery<TSchema>(
		filter: Filter<TSchema>,
		skipContent?: SkipContent | string,
		options: KeySetFindOptions = {},
	): PaginatedQuery<TSchema> {
		const skipTokenContent =
			typeof skipContent === 'string'
				? this.decryptSkipContent(skipContent)
				: skipContent;

		const paginatedLimit =
			options.limit ??
			skipTokenContent?.limit ??
			this.options.defaultLimit ??
			10;
		const paginatedSort =
			skipTokenContent?.sort ?? this.getSortQuery(options.sort);
		const paginatedFilter = this.getFilterQuery(filter, skipTokenContent);

		const getSkipContent = (documentList: Document[] = []): SkipContent => {
			if (!documentList.length || documentList.length < paginatedLimit) {
				return;
			}

			const lastDocument = documentList[documentList.length - 1];
			return {
				skipValues: this.getSkipValues(paginatedSort, lastDocument),
				limit: paginatedLimit,
				sort: paginatedSort,
			};
		};

		const getSkipToken = (documentList: Document[] = []): string => {
			return this.encryptSkipContent(getSkipContent(documentList));
		};

		return {
			paginatedFilter,
			paginatedSort,
			paginatedLimit,
			getSkipContent,
			getSkipToken,
		};
	}

	encryptSkipContent(skipContent: SkipContent): string {
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv(
			this.options.encryptionAlgorithm,
			this.options.encryptionKey,
			iv,
		);
		let encrypted = cipher.update(
			EJSON.stringify(skipContent),
			'utf8',
			'base64url',
		);
		encrypted += cipher.final('base64url');
		return `${iv.toString('base64url')}.${encrypted}`;
	}

	decryptSkipContent(skipContentEncrypted: string): SkipContent {
		const encryptedParts = skipContentEncrypted.split('.');
		const iv = Buffer.from(encryptedParts[0], 'base64url');
		const encryptedText = encryptedParts[1];
		const decipher = crypto.createDecipheriv(
			this.options.encryptionAlgorithm,
			this.options.encryptionKey,
			iv,
		);
		let decrypted = decipher.update(encryptedText, 'base64url', 'utf8');
		decrypted += decipher.final('utf8');
		return EJSON.parse(decrypted);
	}

	private getFilterQuery<TSchema>(
		filter: Filter<TSchema>,
		skipContent: SkipContent,
	): Filter<TSchema> {
		if (!skipContent) {
			return filter;
		}

		const sortObj = skipContent.sort;
		const sortObjWithoutId = Object.entries(sortObj).reduce(
			(obj, [key, value]) =>
				key === '_id'
					? obj
					: {
							// biome-ignore lint/performance/noAccumulatingSpread: This is a loop of 0-4 items tops. No performance impact.
							...obj,
							[key]: value,
						},
			{},
		);

		let paginatedFilter = {
			...filter,
		} as Filter<TSchema>;

		if (!sortObj || !Object.keys(sortObjWithoutId).length) {
			return filter._id
				? paginatedFilter
				: {
						...paginatedFilter,
						_id: {
							[`${sortObj?._id === -1 ? '$lt' : '$gt'}`]:
								skipContent.skipValues._id,
						},
					};
		}

		const sortObjWithoutIdKeyList = Object.keys(sortObjWithoutId) ?? [];
		const sortObjKeyList = [...sortObjWithoutIdKeyList, '_id'];

		const getQueryOrList = (currentSortKeyList: string[]) => {
			const currentKeyIndex = sortObjKeyList?.findIndex(
				(key) => key === currentSortKeyList?.[0],
			);
			const nextKeyIndex = sortObjKeyList?.findIndex(
				(key) => key === currentSortKeyList?.[1],
			);
			const currentKey = sortObjKeyList?.[currentKeyIndex];
			const nextKey = sortObjKeyList?.[nextKeyIndex];
			const firstKey = currentSortKeyList?.[0];
			const lastKey = sortObjKeyList?.[sortObjKeyList.length - 1];
			const currentKeyValue = skipContent.skipValues[currentKey];
			const nextKeyValue = skipContent.skipValues[nextKey];
			const orList = [];

			if (currentKey === firstKey) {
				if (
					typeof currentKeyValue === 'undefined' ||
					currentKeyValue === null
				) {
					if (sortObj[currentKey] !== -1) {
						orList.push({
							[currentKey]: {
								$exists: true,
								$ne: null,
							},
						});
					}
				} else {
					orList.push({
						[currentKey]: {
							[`${sortObj[currentKey] === -1 ? '$lt' : '$gt'}`]:
								currentKeyValue ?? null,
						},
					});
				}
			}

			if (nextKey) {
				let recursiveObj: { [key: string]: unknown } = {
					[currentKey]: currentKeyValue ?? null,
				};

				if (nextKey !== lastKey) {
					recursiveObj = {
						...recursiveObj,
						$or: getQueryOrList(currentSortKeyList.slice(1)),
					};
				} else {
					recursiveObj = {
						...recursiveObj,
						[nextKey]: {
							[`${sortObj[nextKey] === -1 ? '$lt' : '$gt'}`]:
								nextKeyValue ?? null,
						},
					};
				}

				orList.push(recursiveObj);
			}

			return orList;
		};

		const paginationQuery = {
			$or: getQueryOrList(sortObjKeyList),
		};

		if (paginatedFilter.$or) {
			paginatedFilter = {
				$and: [paginatedFilter, paginationQuery],
			} as Filter<TSchema>;
		} else {
			paginatedFilter = {
				...paginatedFilter,
				...paginationQuery,
			};
		}

		return paginatedFilter;
	}

	/**
	 * Enforces _id sorting, even when not provided,
	 * to avoid inconsistencies due to the default [natural order](https://www.mongodb.com/docs/manual/reference/glossary/#std-term-natural-order)
	 */
	private getSortQuery(sort: KeySetSort = {}): KeySetSort {
		return {
			...sort,
			_id: sort._id === -1 ? -1 : 1,
		};
	}

	private getSkipValues(sort: KeySetSort, document: Document): SkipValues {
		return Object.keys(sort).reduce(
			(obj, sortKey) => ({
				// biome-ignore lint/performance/noAccumulatingSpread: This is a loop of 0-4 items tops. No performance impact.
				...obj,
				[sortKey]: this.getDocumentSkipValue(sortKey, document) ?? null,
			}),
			{},
		);
	}

	private getDocumentSkipValue(key: string, document: Document): SkipValue {
		const keyPartList = key?.split('.') ?? [];

		if (keyPartList.length <= 1) {
			return document[keyPartList[0]];
		}

		return this.getDocumentSkipValue(
			keyPartList.slice(1, keyPartList.length).join('.'),
			document[keyPartList[0]],
		);
	}
}
