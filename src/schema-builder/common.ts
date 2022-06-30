import {
	AbstractTable,
	and,
	eq,
	or,
	PgBigDecimal,
	PgBigInt,
	PgBoolean,
	PgInteger,
	PgText,
	PgTime,
	PgTimestamp,
	PgVarChar,
	raw,
} from 'drizzle-orm';
import {
	greater,
	greaterEq,
	inArray,
	isNotNull,
	isNull,
	less,
	lessEq,
	like,
	notEq,
} from 'drizzle-orm/builders/requestBuilders/where/static';
import Expr from 'drizzle-orm/builders/requestBuilders/where/where';
import { AbstractColumn } from 'drizzle-orm/columns/column';
import PgBigInt53, { PgBigInt64 } from 'drizzle-orm/columns/types/pgBigInt';
import PgBigSerial53, {
	PgBigSerial64,
} from 'drizzle-orm/columns/types/pgBigSerial';
import PgSerial from 'drizzle-orm/columns/types/pgSerial';
import PgSmallInt from 'drizzle-orm/columns/types/pgSmallInt';
import PgTimestamptz from 'drizzle-orm/columns/types/pgTimestamptz';
import { AnyColumn } from 'drizzle-orm/tables/inferTypes';
import {
	GraphQLBoolean,
	GraphQLInputFieldConfig,
	GraphQLInputObjectType,
	GraphQLInt,
	GraphQLList,
	GraphQLNonNull,
	GraphQLString,
} from 'graphql';
import memoize from 'lodash.memoize';
import { between, not } from './filter-operators';

export type AnyTable = AbstractTable<any>;

type ReferencedIn = { tsName: string; column: AnyColumn }[];

export function getColumnType(
	column: AnyColumn,
	config: { alwaysNullable?: boolean } = {},
) {
	let result;

	const intTypes = [
		PgSerial,
		PgInteger,
		PgBigDecimal,
		PgBigInt,
		PgBigInt53,
		PgBigInt64,
		PgBigSerial53,
		PgBigSerial64,
		PgSmallInt,
		PgTimestamp,
		PgTimestamptz,
		PgTime,
	] as const;

	const stringTypes = [PgText, PgVarChar] as const;

	const booleanTypes = [PgBoolean] as const;

	if (intTypes.some((t) => column.getColumnType() instanceof t)) {
		result = GraphQLInt;
	} else if (stringTypes.some((t) => column.getColumnType() instanceof t)) {
		result = GraphQLString;
	} else if (booleanTypes.some((t) => column.getColumnType() instanceof t)) {
		result = GraphQLBoolean;
	}

	if (!result) {
		throw new Error(
			`Unsupported column type: ${JSON.stringify(
				column.getColumnType(),
			)}`,
		);
	}

	if (!column.isNullableFlag && !config.alwaysNullable) {
		result = new GraphQLNonNull(result);
	}

	return result;
}

export function getTableColumns(table: AbstractTable<any>) {
	return Object.fromEntries(
		Object.entries(table).filter(
			(pair): pair is [string, AnyColumn] =>
				pair[1] instanceof AbstractColumn,
		),
	);
}

export function getTableForeignKeys(table: AbstractTable<any>) {
	return Object.fromEntries(
		Object.entries(getTableColumns(table))
			.map(
				([name, col]) =>
					[name, col.getReferenced() ?? undefined] as const,
			)
			.filter(
				(pair): pair is [string, NonNullable<typeof pair[1]>] =>
					!!pair[1],
			),
	);
}

interface BuildQueryNameParams<T extends AbstractTable<T>> {
	table: T;
	type: 'select' | 'update' | 'insert' | 'delete';
}

export function buildQueryName<T extends AbstractTable<T>>({
	table,
	...params
}: BuildQueryNameParams<T>): string {
	switch (params.type) {
		case 'select':
			return `select_from_${table.tableName()}`;
		case 'update':
			return `update_${table.tableName()}`;
		case 'insert':
			return `insert_into_${table.tableName()}`;
		case 'delete':
			return `delete_from_${table.tableName()}`;
	}
}

type BuildFieldNameParams =
	| {
			type: 'select_joined';
			fkColumnName: string;
	  }
	| {
			type: 'select_reverse_joined';
			fkTableName: string;
			fkColumnName: string;
	  };

export function buildFieldName(params: BuildFieldNameParams) {
	switch (params.type) {
		case 'select_joined':
			return `${params.fkColumnName}__joined`;
		case 'select_reverse_joined':
			return `${params.fkTableName}__${params.fkColumnName}__joined`;
	}
}

export const buildGQLFilters = memoize(
	(table: AbstractTable<any>) => {
		const columns = getTableColumns(table);

		const fields = Object.fromEntries(
			Object.entries(columns).map(([name, column]) => [
				name,
				{
					type: buildFieldFilterForColumn(column),
				},
			]),
		);

		const result: GraphQLInputObjectType = new GraphQLInputObjectType({
			name: `where_${table.tableName()}`,
			fields: () => ({
				...fields,
				_raw: {
					type: GraphQLString,
				},
				_or: {
					type: new GraphQLList(result),
				},
				_and: {
					type: new GraphQLList(result),
				},
				_not: {
					type: result,
				},
			}),
		});

		return result;
	},
	(t) => t.tableName(),
);

export function buildSQLFilters({
	where,
	columns,
}: {
	where: QueryFilter;
	columns: Record<string, AnyColumn>;
}): Expr {
	let filterTypesCount =
		+!!where._raw + +!!where._or + +!!where._and + +!!where._not;

	if (
		filterTypesCount > 0 &&
		Object.keys(where).length - filterTypesCount > 0
	) {
		++filterTypesCount;
	}

	if (filterTypesCount > 1) {
		throw new Error(
			`Invalid filter: ${JSON.stringify(
				where,
			)}. Only one filter type is allowed.`,
		);
	}

	if (typeof where._raw === 'string') {
		return raw(where._raw);
	}

	if (where._or) {
		return or(
			where._or.map((filter) =>
				buildSQLFilters({ where: filter, columns }),
			),
		);
	}

	if (where._and) {
		return and(
			where._and.map((filter) =>
				buildSQLFilters({ where: filter, columns }),
			),
		);
	}

	if (where._not) {
		return not(buildSQLFilters({ where: where._not, columns }));
	}

	return and(
		Object.entries(where).map(([key, _value]) => {
			const col = columns[key]!;
			const value = _value as FieldFilter;
			if (value.eq) {
				return eq(col, value.eq);
			}
			if (value.notEq) {
				return notEq(col, value.notEq);
			}
			if (value.in) {
				return inArray(col, value.in);
			}
			if (value.notIn) {
				return not(inArray(col, value.notIn));
			}
			if (value.less) {
				return less(col, value.less);
			}
			if (value.lessEq) {
				return lessEq(col, value.lessEq);
			}
			if (value.greater) {
				return greater(col, value.greater);
			}
			if (value.greaterEq) {
				return greaterEq(col, value.greaterEq);
			}
			if (value.like) {
				return like(col, value.like);
			}
			if (value.between) {
				if (value.between.length !== 2) {
					throw new Error(
						`Invalid filter: ${JSON.stringify(
							value,
						)}. Between filter must have exactly two values.`,
					);
				}
				return between(col, [value.between[0], value.between[1]]);
			}
			if (value.isNull) {
				return isNull(col);
			}
			if (value.isNotNull) {
				return isNotNull(col);
			}
			throw new Error(`Unknown filter: ${JSON.stringify(value)}.`);
		}),
	);
}

interface FieldFilter {
	eq?: {};
	notEq?: {};
	in?: {}[];
	notIn?: {}[];
	less?: {};
	lessEq?: {};
	greater?: {};
	greaterEq?: {};
	like?: string;
	between?: {}[];
	isNull?: boolean;
	isNotNull?: boolean;
}

type QueryFilter = {
	[key: string]: FieldFilter;
} & {
	_raw?: string;
	_or?: QueryFilter[];
	_and?: QueryFilter[];
	_not?: QueryFilter;
};

export const buildFieldFilterForColumn = memoize(
	(column: AnyColumn): GraphQLInputObjectType => {
		const gqlColumnType = getColumnType(column, {
			alwaysNullable: true,
		});

		const fields: Record<keyof FieldFilter, GraphQLInputFieldConfig> = {
			eq: {
				type: gqlColumnType,
				description: 'Equals',
			},
			notEq: {
				type: gqlColumnType,
				description: 'Not equals',
			},
			in: {
				type: new GraphQLList(new GraphQLNonNull(gqlColumnType)),
				description: 'In',
			},
			notIn: {
				type: new GraphQLList(new GraphQLNonNull(gqlColumnType)),
				description: 'Not in',
			},
			less: {
				type: gqlColumnType,
				description: 'Less than',
			},
			lessEq: {
				type: gqlColumnType,
				description: 'Less than or equal',
			},
			greater: {
				type: gqlColumnType,
				description: 'Greater than',
			},
			greaterEq: {
				type: gqlColumnType,
				description: 'Greater than or equal',
			},
			like: {
				type: GraphQLString,
				description: 'Like',
			},
			between: {
				type: new GraphQLList(new GraphQLNonNull(gqlColumnType)),
				description: 'Between',
			},
			isNull: {
				type: GraphQLBoolean,
				description: 'Is null',
			},
			isNotNull: {
				type: GraphQLBoolean,
				description: 'Is not null',
			},
		};

		return new GraphQLInputObjectType({
			name: `${gqlColumnType.toString()}_filter`,
			fields,
		});
	},
	(c) =>
		getColumnType(c, {
			alwaysNullable: true,
		}).toString(),
);

const cacheByName = memoize(<T>(value: T, resolver: string) => {
	return memoize(
		() => value,
		() => resolver,
	);
});
