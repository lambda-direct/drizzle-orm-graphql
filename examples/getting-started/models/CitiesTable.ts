import { AbstractTable } from 'drizzle-orm';

export class CitiesTable extends AbstractTable<CitiesTable> {
	id = this.serial('id').primaryKey();
	name = this.text('name').notNull();

	tableName(): string {
		return 'cities';
	}
}
