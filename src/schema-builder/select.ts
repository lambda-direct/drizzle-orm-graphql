import { AbstractTable, and, eq } from 'drizzle-orm';
import Expr from 'drizzle-orm/builders/requestBuilders/where/where';
import { AnyColumn } from 'drizzle-orm/tables/inferTypes';
import {
	GraphQLFieldConfig,
	GraphQLFieldConfigArgumentMap,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLOutputType,
} from 'graphql';
import memoize from 'lodash.memoize';

import {
	AnyTable,
	buildFieldName,
	buildGQLFilters,
	buildQueryName,
	buildSQLFilters,
	getColumnType,
	getTableColumns,
	getTableForeignKeys,
} from './common';

interface JoinConfig {
	sourceColumn: { tsName: string; data: AnyColumn };
}

type ReferencedIn = { tsName: string; column: AnyColumn }[];

export function buildSelectSchemaForTable({
	table,
	tables,
}: {
	table: AnyTable;
	tables: AnyTable[];
}): [string, GraphQLFieldConfig<any, any>][] {
	return [
		[
			`select_from_${table.tableName()}`,
			buildGQLFieldFromTable({
				table,
				referencedIn: listReferencedIn(table, tables),
			}),
		],
	];
}

function listReferencedIn(table: AnyTable, tables: AnyTable[]) {
	return tables.reduce<{ tsName: string; column: AnyColumn }[]>(
		(acc, cur) => {
			const fks = Object.entries(getTableColumns(cur))
				.filter(
					([, column]) =>
						column.getReferenced()?.getParent().tableName() ===
						table.tableName(),
				)
				.map(([tsName, column]) => ({ tsName, column }));
			acc.push(...fks);
			return acc;
		},
		[],
	);
}

function buildGQLFieldFromTable({
	table,
	join,
	referencedIn,
}: {
	table: AbstractTable<any>;
	referencedIn: ReferencedIn;
	join?: JoinConfig;
}): GraphQLFieldConfig<any, any> {
	const { type } = buildGQLTypeFromTable({
		table,
		referencedIn,
		join: join,
	});

	const columns = getTableColumns(table);

	let resolve: GraphQLFieldConfig<any, any>['resolve'];
	let args: GraphQLFieldConfigArgumentMap | undefined;

	if (join) {
		resolve = async (source, _args, _context, _info) => {
			return (
				await table
					.select()
					.where(
						eq(
							join.sourceColumn.data,
							source[join.sourceColumn.tsName],
						),
					)
					.limit(1)
					.execute()
			)[0];
		};
	} else {
		args = {
			filter: { type: buildGQLFilters(table) },
		};
		resolve = async (_source, args, _context, _info) => {
			const request = table.select();

			if (Object.keys(args?.filter ?? {}).length > 0) {
				request.where(buildSQLFilters(args.filter));
			}

			return request.execute();
		};
	}

	return {
		type,
		resolve,
		...(args ? { args } : {}),
	};
}

export const buildGQLTypeFromTable = memoize(
	<TTable extends AbstractTable<TTable>>({
		table,
		referencedIn = [],
		join,
	}: {
		table: TTable;
		referencedIn?: ReferencedIn;
		join?: JoinConfig | undefined;
	}): { type: GraphQLOutputType; rawType: GraphQLObjectType } => {
		const columns = getTableColumns(table);
		const foreignKeys = getTableForeignKeys(table);

		const name = buildTypeNameFromModel({
			table,
			join,
		});

		const rawType: GraphQLObjectType = new GraphQLObjectType({
			name,
			fields: Object.fromEntries([
				...Object.entries(columns).map(([key, column]) => [
					key,
					{ type: getColumnType(column) },
				]),
				...Object.entries(foreignKeys).map(([key, column]) => [
					buildFieldName({
						type: 'select_joined',
						fkColumnName: key,
					}),
					buildGQLFieldFromTable({
						table: column.getParent(),
						referencedIn,
						join: {
							sourceColumn: { tsName: key, data: column },
						},
					}),
				]),
				...referencedIn.map(({ tsName, column }) => {
					const name = buildFieldName({
						type: 'select_reverse_joined',
						fkTableName: column.getParent().tableName(),
						fkColumnName: tsName,
					});
					const type = new GraphQLList(
						buildGQLTypeFromTable({
							table: column.getParent(),
						}).rawType,
					);
					const resolve: GraphQLFieldConfig<
						any,
						any
					>['resolve'] = async (source, _args, _context, _info) => {
						const referencedColumnName = Object.entries(
							columns,
						).find(
							([, col]) =>
								col.getColumnName() ===
								column.getReferenced().getColumnName(),
						)![0];

						return column
							.getParent()
							.select()
							.where(eq(column, source[referencedColumnName]))
							.execute();
					};

					return [name, { type, resolve }];
				}),
			]),
		});

		let result: GraphQLOutputType = rawType;

		if (join) {
			if (!join.sourceColumn.data.isNullableFlag) {
				result = new GraphQLNonNull(result);
			}
		} else {
			result = new GraphQLList(new GraphQLNonNull(result));
		}

		return { type: result, rawType };
	},
	({ table, join: joinConfig }) =>
		buildTypeNameFromModel({
			table,
			join: joinConfig,
		}),
);

function buildTypeNameFromModel(config: {
	table: AnyTable;
	join?: JoinConfig | undefined;
}): string {
	const { table, join } = config;

	if (join) {
		return buildFieldName({
			type: 'select_joined',
			fkColumnName: join.sourceColumn.tsName,
		});
	}

	return buildQueryName({ table, type: 'select' });
}
