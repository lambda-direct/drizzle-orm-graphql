import { ISession } from 'drizzle-orm';
import Expr from 'drizzle-orm/builders/requestBuilders/where/where';
import Var from 'drizzle-orm/builders/requestBuilders/where/var';
import { AnyColumn } from 'drizzle-orm/tables/inferTypes';

export class Not extends Expr {
	constructor(public expr: Expr) {
		super();
	}

	toQuery({ position, session }: { position?: number; session: ISession }): {
		query: string;
		values: any[];
	} {
		const { query, values } = this.expr.toQuery({
			...(position ? { position } : {}),
			session,
		});

		return {
			query: `not (${query})`,
			values,
		};
	}

	toQueryV1({
		position,
		session,
	}: {
		position?: number;
		tableCache?: { [tableName: string]: string };
		session: ISession;
	}): { query: string; values: any[] } {
		return this.toQuery({ ...(position ? { position } : {}), session });
	}
}

export function not(expr: Expr) {
	return new Not(expr);
}

export class Between extends Expr {
	constructor(
		public col: AnyColumn,
		public min: unknown,
		public max: unknown,
	) {
		super();
	}

	toQuery({
		position = 1,
		session,
	}: {
		position?: number;
		session: ISession;
	}): {
		query: string;
		values: any[];
	} {
		const colExpr = new Var(this.col);

		const { query, values } = colExpr.toQuery({
			position,
			session,
		});

		return {
			query: `${query} between ${session.parametrized(
				position + values.length,
			)} and ${session.parametrized(position + values.length + 1)}`,
			values: [...values, this.min, this.max],
		};
	}

	toQueryV1({
		position = 1,
		session,
	}: {
		position?: number;
		tableCache?: { [tableName: string]: string };
		session: ISession;
	}): { query: string; values: any[] } {
		return this.toQuery({ position, session });
	}
}

export function between(col: AnyColumn, [min, max]: [unknown, unknown]) {
	return new Between(col, min, max);
}
