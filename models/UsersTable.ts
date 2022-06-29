import { AbstractTable } from 'drizzle-orm';

import { CitiesTable } from './CitiesTable';

export class UsersTable extends AbstractTable<UsersTable> {
	id = this.serial('id').primaryKey();
	name = this.text('name').notNull();
	email = this.text('email').notNull();
	cityId = this.int('city_id').foreignKey(CitiesTable, (cities) => cities.id);

	tableName(): string {
		return 'users';
	}
}
