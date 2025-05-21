import type {Filter, Document, SortDirection, FindOptions} from 'mongodb';
import isDate from 'lodash.isdate';
import type {ObjectIdLike} from "bson";
import {isObjectId} from "./utils.ts";

export type SkipValue = string | number | boolean | bigint | Date | ObjectIdLike | null;

export interface SkipValues {
    [key: string]: SkipValue | null;
}

/**
 * For simplicity, we've opinionated for the sort to be of type object.
 * In the future we can support more types.
 */
export interface KeySetSort {
    [key: string]: SortDirection;
}

export interface SkipTokenContent {
    sort: KeySetSort,
    limit: number,
    skipValues: SkipValues,
}

export interface KeySetFindOptions extends FindOptions {
    sort?: KeySetSort;
}

export interface PaginatedQuery<TSchema> {
    paginatedFilter: Filter<TSchema>,
    paginatedSort: KeySetSort,
    paginatedLimit: number,

    getSkipContent(documentList: Document[]): SkipTokenContent
}

/**
 * For more details: https://medium.com/swlh/mongodb-pagination-fast-consistent-ece2a97070f3
 * TODO: Make a class where some defaults can be configured, like the fallback 100 limit
 */
export async function getPaginatedQuery<TSchema>(filter: Filter<TSchema>, skipTokenContent?: SkipTokenContent, options: KeySetFindOptions = {}): Promise<PaginatedQuery<TSchema>> {
    const paginatedLimit = options.limit ?? skipTokenContent?.limit ?? 100;
    const paginatedSort = skipTokenContent?.sort ?? getSortQuery(options.sort);
    const paginatedFilter = getFilterQuery(filter, skipTokenContent);

    const getSkipContent = (documentList: Document[] = []): SkipTokenContent => {
        if (!documentList.length || documentList.length < paginatedLimit) {
            return;
        }

        const lastDocument = documentList[documentList.length - 1];
        return {
            skipValues: getSkipValues(paginatedSort, lastDocument),
            limit: paginatedLimit,
            sort: paginatedSort,
        };
    }

    return {
        paginatedFilter,
        paginatedSort,
        paginatedLimit,
        getSkipContent
    };
}

export function getFilterQuery<TSchema>(filter: Filter<TSchema>, skipTokenContent: SkipTokenContent): Filter<TSchema> {
    if (!skipTokenContent) {
        return filter;
    }

    const sortObj = skipTokenContent.sort;
    const sortObjWithoutId = Object.entries(sortObj).reduce((obj, [key, value]) => key === '_id' ? obj : {
        ...obj,
        [key]: value,
    }, {});

    let paginatedFilter = {
        ...filter,
    } as Filter<TSchema>;

    if (!sortObj || !Object.keys(sortObjWithoutId).length) {
        return !!filter._id ? paginatedFilter : {
            ...paginatedFilter,
            _id: {
                [`${sortObj?._id === -1 ? '$lt' : '$gt'}`]: skipTokenContent.skipValues._id,
            },
        };
    }

    const sortObjWithoutIdKeyList = Object.keys(sortObjWithoutId) ?? [];
    const sortObjKeyList = [...sortObjWithoutIdKeyList, '_id'];

    const getQueryOrList = (currentSortKeyList: string[]) => {
        const currentKeyIndex = sortObjKeyList?.findIndex(
            (key) => key === currentSortKeyList?.[0]
        );
        const nextKeyIndex = sortObjKeyList?.findIndex(
            (key) => key === currentSortKeyList?.[1]
        );
        const currentKey = sortObjKeyList?.[currentKeyIndex];
        const nextKey = sortObjKeyList?.[nextKeyIndex];
        const lastKey = sortObjKeyList?.[sortObjKeyList.length - 1];
        const currentKeyValue = skipTokenContent.skipValues[currentKey];
        const nextKeyValue = skipTokenContent.skipValues[nextKey];
        const orList = [];

        if (!!nextKey) {

            if (typeof currentKeyValue === 'undefined' || currentKeyValue === null) {
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
                        [`${
                            sortObj[currentKey] === -1 ? '$lt' : '$gt'
                        }`]: currentKeyValue,
                    },
                });
            }
        }

        if (!!nextKey) {
            if (nextKey === lastKey) {
                return [
                    ...orList,
                    {
                        [currentKey]: currentKeyValue ?? null,
                        [nextKey]: {
                            [`${
                                sortObj[nextKey] === -1 ? '$lt' : '$gt'
                            }`]: nextKeyValue,
                        },
                    },
                ];
            } else {
                return [
                    ...orList,
                    {
                        [currentKey]: currentKeyValue ?? null,
                        $or: getQueryOrList(currentSortKeyList.slice(1)),
                    },
                ];
            }
        }

        return [
            ...orList,
            {
                ...sortObjKeyList
                    .slice(0, sortObjKeyList.length - 1)
                    .reduce((obj, key) => ({
                        ...obj,
                        [key]: skipTokenContent.skipValues[key],
                    }), {}),
                [sortObjKeyList[sortObjKeyList.length - 1]]: {
                    [`${
                        sortObj[sortObjKeyList[sortObjKeyList.length - 1]] === -1
                            ? '$lt'
                            : '$gt'
                    }`]: skipTokenContent.skipValues[
                        sortObjKeyList[sortObjKeyList.length - 1]
                        ],
                },
            },
        ];
    };

    const paginationQuery = {
        $or: getQueryOrList(sortObjKeyList),
    };

    if (!!paginatedFilter.$or) {
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
 * Ensures _id sorting, even when not provided.
 * From the conversations on https://medium.com/swlh/mongodb-pagination-fast-consistent-ece2a97070f3:
 *
 * One more thing which I noticed, you should always pass sort( { _id : 1 | -1 } ).
 * Here's why:
 *
 * When getting 1st page, mongoDB gets it in $natural_order, which is not guaranteed, to get the docs in id=>ASC order.
 * This means, you can get 1st page which contains ids, which are not less than the last element id of returned 1st page docs.
 *
 * Example:
 *
 * 1st page:
 * id = 1
 * id = 2
 * id = 5
 * id = 3
 *
 * Now when you do id > 1st page lastElement.id you get, 2nd page:
 * id = 4
 * id = 5
 * id = 6
 * id = 7
 *
 * As you see, it gets id=5 twice: on page 1 and 2.
 */
export function getSortQuery(sort: KeySetSort = {}): KeySetSort {
    return {
        ...sort,
        _id: sort._id === -1 ? -1 : 1,
    };
}

export function getSkipValues(sort: KeySetSort, document: Document): SkipValues {
    return Object.keys(sort).reduce((obj, sortKey) => ({
        ...obj,
        [sortKey]: getDocumentSkipValue(sortKey, document) ?? null
    }), {});
}

export function getDocumentSkipValue(key: string, document: Document): SkipValue {
    const keyPartList = key?.split('.') ?? [];

    if (keyPartList.length <= 1) {
        return document[keyPartList[0]];
    }

    const documentDotNotationValue = document[key];

    if (isValueDefinedPrimitive(documentDotNotationValue)) {
        return documentDotNotationValue;
    }

    return getDocumentSkipValue(keyPartList.slice(1, keyPartList.length).join('.'), document[keyPartList[0]])
}

function isValueDefinedPrimitive(value: any): boolean {
    return (
        typeof value !== 'undefined' &&
        !Array.isArray(value) &&
        (typeof value !== 'object' || isDate(value) || isObjectId(value)) &&
        typeof value !== 'symbol' &&
        typeof value !== 'function'
    )
}
