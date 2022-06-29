import {
	GraphQLFieldConfig,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLInputObjectType,
	GraphQLBoolean,
} from 'graphql';
import flatten from 'lodash.flatten';

import {
	AnyTable,
	buildGQLFilters,
	buildSQLFilters,
	getColumnType,
	getTableColumns,
} from './common';
import { buildGQLTypeFromTable } from './select';

export function buildUpdateSchemaForTable({
	table,
}: {
	table: AnyTable;
}): [string, GraphQLFieldConfig<any, any>][] {
	return [
		[
			`update_${table.tableName()}`,
			buildGQLFieldFromTable({
				table,
			}),
		],
	];
}

function buildGQLFieldFromTable({
	table,
}: {
	table: AnyTable;
}): GraphQLFieldConfig<any, any> {
	const columns = getTableColumns(table);

	return {
		type: buildGQLTypeFromTable({ table }).rawType,
		args: {
			set: {
				type: new GraphQLNonNull(
					new GraphQLInputObjectType({
						name: `update_${table.tableName()}`,
						fields: Object.fromEntries([
							...flatten(
								Object.entries(columns).map(
									([tsName, column]) => {
										const type = getColumnType(column, {
											alwaysNullable: true,
										});
										const result = [
											[
												tsName,
												{
													type,
													description: `New value for "${tsName}"`,
												},
											],
										];

										if (column.isNullableFlag) {
											result.push([
												`_set_${tsName}_null`,
												{
													type: GraphQLBoolean,
													description: `Set "${tsName}" to null`,
												},
											]);
										}

										return result;
									},
								),
							),
						]),
					}),
				),
			},
			where: {
				type: buildGQLFilters(table),
			},
		},
		resolve: async (source, args, context, info) => {
			const values: {
				[key in keyof typeof table]: typeof table[key];
			} & {
				[key in `_set_${string}_null`]: boolean;
			} = args.set;

			const request = table.update().set(
				Object.fromEntries(
					Object.entries(values).map(([tsName, gqlValue]) => {
						let name = tsName;
						let value: unknown = gqlValue;
						if (/^_set_(.+)_null$/.test(tsName)) {
							name = tsName.replace(/^_set_(.+)_null$/, '$1');
							value = null;
						}

						name = Object.entries(columns).find(
							([tsName]) => tsName === name,
						)![0];

						return [name, value];
					}),
				),
			);

			if (Object.keys(args.where).length > 0) {
				request.where(buildSQLFilters({ where: args.where, columns }));
			}

			return (await request.all())[0];
		},
	};
}
