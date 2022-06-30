import { ApolloServer, gql } from 'apollo-server';

const typeDefs = gql`
	type UsersItem {
		id: String!
		name: String
		age: Int
		description: String
		city_id: String
		$city_id__joined: CitiesItem
	}

	fragment UsersOwnFields on UsersItem {
		id
		name
		age
		description
		city_id
	}

	type CitiesItem {
		id: String!
		name: String!
		$users__city_id__joined: [UsersItem]
	}

	fragment CitiesOwnFields on CitiesItem {
		id
		name
	}

	input StringFilter {
		eq: String
		ne: String
		in: [String]
		nin: [String]
		lt: String
		lte: String
		gt: String
		gte: String
	}

	input IntFilter {
		eq: Int
		ne: Int
		in: [Int]
		nin: [Int]
		lt: Int
		lte: Int
		gt: Int
		gte: Int
	}

	input UsersFilter {
		id: StringFilter
		name: StringFilter
		age: IntFilter
		description: StringFilter
		city_id__joined: CitiesFilter
		_raw: String
		_or: [UsersFilter]
		_and: [UsersFilter]
		_not: UsersFilter
	}

	input CitiesFilter {
		id: StringFilter
		name: StringFilter
		users__city_id__joined: UsersFilter
		_raw: String
		_or: [UsersFilter]
		_and: [UsersFilter]
		_not: UsersFilter
	}

	input update_users {
		id: String
		name: String
		age: Int
		description: String
		city_id: String
		$set_id_null: Boolean
		$set_name_null: Boolean
		$set_age_null: Boolean
		$set_description_null: Boolean
		$set_city_id_null: Boolean
	}

	type Query {
		select_from_users(filter: UsersFilter): [UsersItem]
		insert_into_cities(filter: CitiesFilter): [CitiesItem]
	}

	type Mutation {
		update_users(set: update_users}) {
			...UsersOwnFields
		}
	}
`;

const server = new ApolloServer({
	typeDefs,
	mocks: true,
});

server.listen().then(({ url }) => {
	console.log(`🚀 Server ready at ${url}`);
});
