import {
	AbstractTable,
	and,
	eq,
	PgBigDecimal,
	PgBigInt,
	PgBoolean,
	PgInteger,
	PgText,
	PgTime,
	PgTimestamp,
	PgVarChar,
} from 'drizzle-orm';
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
	GraphQLInputObjectType,
	GraphQLInt,
	GraphQLNonNull,
	GraphQLString,
} from 'graphql';
import memoize from 'lodash.memoize';

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

		const result = new GraphQLInputObjectType({
			name: `where_${table.tableName()}`,
			fields: Object.fromEntries(
				Object.entries(columns).map(([key, column]) => [
					key,
					{ type: getColumnType(column, { alwaysNullable: true }) },
				]),
			),
		});

		return result;
	},
	(t) => t.tableName(),
);

export function buildSQLFilters({
	where,
	columns,
}: {
	where: any;
	columns: Record<string, AnyColumn>;
}): Expr {
	return and(
		Object.entries(where).map(([key, value]) => {
			const col = columns[key]!;
			return eq(col, value as {});
		}),
	);
}
