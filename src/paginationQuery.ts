import type {Filter, ObjectId} from 'mongodb';
import isDate from 'lodash.isdate';

type SkipValue = string | number | boolean | bigint | object | ObjectId | null | undefined;
type SkipValueType = 'string' | 'number' | 'boolean' | 'bigint' | 'date' | 'objectid' | 'null' | 'undefined';

/**
 * For simplicity, we've opinionated for the sort to be of type object.
 * In the future we can support more types.
 */
interface KeySetSort {
    [key: string]: number;
}

interface SkipTokenContent {
    sort: KeySetSort,
    limit: number,
    skipValues: {
        [key: string]: {
            type: SkipValueType,
            value: SkipValue
        };
    },
}

interface KeySetFindOptions {
    sort?: KeySetSort;
    limit: number;
}

/**
 * For more details: https://medium.com/swlh/mongodb-pagination-fast-consistent-ece2a97070f3
 * TODO: Make a class where some defaults can be configured, like the fallback 100 limit
 */
async function getPaginatedQuery(filter: Filter<any>, skipToken?: string, options: KeySetFindOptions = { limit: 100 }) {
    let skipTokenContent: SkipTokenContent;

    if (skipToken) {
        skipTokenContent = decodeSkipToken(skipToken);
    }

    const limit = options.limit ?? skipTokenContent?.limit;
    const sort = skipTokenContent?.sort ?? getSortQuery(options.sort);
    const filterQuery = getFilterQuery(filter, skipTokenContent);

    const queryOptions = {
        ...(skipTokenProps?.options ?? options),
        limit,
        sort,
        lean: options.lean !== false,
    };

    const list = await Model.find(filterQuery, projection, queryOptions).exec();

    if (!list.length || list.length < limit) {
        return [list];
    }

    const lastItem = list[list.length - 1];

    const newSkipToken = encryption.encrypt(
        JSON.stringify({
            skip: Object.keys(sort).reduce(
                (obj, key) => ({
                    ...obj,
                    [key]: isValidObjectId(lastItem[key])
                        ? getObjectIdToString(lastItem[key])
                        : lastItem[key],
                }),
                {}
            ),
            options: queryOptions,
            limit,
            sort,
        })
    );

    return [list, newSkipToken];
}

function getFilterQuery(filter: Filter<any>, skipTokenContent: SkipTokenContent): Filter<any> {
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
    };

    if (!sortObj || !Object.keys(sortObjWithoutId).length) {
        return {
            ...paginatedFilter,
            _id: {
                [`${sortObj?._id === -1 ? '$lt' : '$gt'}`]: skipTokenContent.skipValues
                    ._id,
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
        const orList = [];

        if (!!nextKey) {
            orList.push({
                [currentKey]: {
                    [`${
                        sortObj[currentKey] === -1 ? '$lt' : '$gt'
                    }`]: skipTokenContent.skipValues[currentKey],
                },
            });
        }

        if (!!nextKey) {
            if (nextKey === lastKey) {
                return [
                    ...orList,
                    {
                        [currentKey]: skipTokenContent.skipValues[currentKey],
                        [nextKey]: {
                            [`${
                                sortObj[nextKey] === -1 ? '$lt' : '$gt'
                            }`]: skipTokenContent.skipValues[nextKey],
                        },
                    },
                ];
            } else {
                return [
                    ...orList,
                    {
                        [currentKey]: skipTokenContent.skipValues[currentKey],
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
        };
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
function getSortQuery(sort: KeySetSort = {}): KeySetSort {
    return {
        ...sort,
        _id: sort._id === -1 ? -1 : 1,
    };
}

function encodeSkipToken(skipTokenContent: SkipTokenContent) {
    return Buffer.from(JSON.stringify(skipTokenContent)).toString('hex');
}

function decodeSkipToken(skipToken: string): SkipTokenContent {
    return JSON.parse(Buffer.from(skipToken, 'hex').toString('utf8'));
}
