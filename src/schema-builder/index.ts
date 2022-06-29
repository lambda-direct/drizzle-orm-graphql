import {
	GraphQLFieldConfig,
	GraphQLObjectType,
	GraphQLSchema,
	ThunkObjMap,
} from 'graphql';
import flatten from 'lodash.flatten';

import { AnyTable } from './common';
import { buildSelectSchemaForTable } from './select';
import { buildUpdateSchemaForTable } from './update';

export * from './common';
export * from './select';

export interface BuildSchemaConfig {
	tables: AnyTable[];
	queries?: ThunkObjMap<GraphQLFieldConfig<any, any>>;
}

export default function buildSchema({
	tables,
	queries = {},
}: BuildSchemaConfig) {
	return new GraphQLSchema({
		query: new GraphQLObjectType({
			name: 'Query',
			fields: {
				...Object.fromEntries(
					flatten(
						tables.map((t) => [
							...buildSelectSchemaForTable({
								table: t,
								tables,
							}),
						]),
					),
				),
				...queries,
			},
		}),
		mutation: new GraphQLObjectType({
			name: 'Mutation',
			fields: {
				...Object.fromEntries(
					flatten(
						tables.map((t) => [
							...buildUpdateSchemaForTable({
								table: t,
							}),
						]),
					),
				),
			},
		}),
	});
}
