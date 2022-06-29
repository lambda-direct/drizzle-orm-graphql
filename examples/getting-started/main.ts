import { ApolloServer } from 'apollo-server';
import { drizzle } from 'drizzle-orm';
import { applyMiddleware } from 'graphql-middleware';
import { allow, deny, shield } from 'graphql-shield';
import ConsoleLogger from 'drizzle-orm/logger/consoleLogger';
import buildSchema, {
	AnyTable,
	buildGQLTypeFromTable,
} from 'drizzle-orm-graphql';

import { UsersTable } from './models/UsersTable';
import { CitiesTable } from './models/CitiesTable';
import { GraphQLInt } from 'graphql';

async function main() {
	const db = await drizzle.connect({
		host: 'localhost',
		port: 5432,
		user: 'postgres',
		password: 'postgres',
		database: 'postgres',
	});

	db.useLogger(new ConsoleLogger());

	await drizzle.migrator(db).migrate('./drizzle.config.yml');

	const usersTable = new UsersTable(db);
	const citiesTable = new CitiesTable(db);
	const tables = [usersTable, citiesTable] as unknown as AnyTable[];

	let schema = buildSchema({
		tables,
		queries: {
			firstUser: {
				type: buildGQLTypeFromTable({
					table: usersTable,
				}).rawType,
				resolve: async () => {
					return (await usersTable.select().limit(1).execute())[0];
				},
			},
			countUsers: {
				type: GraphQLInt,
				resolve: async () => {
					return (
						await db
							.session()
							.execute(
								`select count(*) as count from "${usersTable.tableName()}"`,
							)
					).rows[0].count;
				},
			},
		},
	});

	// const permissions = shield({
	// 	Query: {
	// 		'*': deny,
	// 		[buildQueryName(usersTable, 'select')]: allow,
	// 		[buildQueryName(citiesTable, 'select')]: allow,
	// 	},
	// });

	// schema = applyMiddleware(schema, permissions);

	const server = new ApolloServer({
		schema,
		introspection: true,
	});

	server.listen().then(({ url }) => {
		console.log(`🚀 Server ready at ${url}`);
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
