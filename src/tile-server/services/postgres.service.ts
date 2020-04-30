import * as pg from 'pg';
import { logger } from 'logger';

const types = pg.types;
types.setTypeParser(1114, (stringValue) => {
  return stringValue;
});

const pool = new pg.Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

export class PostgresService {
  static async getDatasetById(id: string) {
    logger.debug(`Obtaining dataset with id ${id}`);
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      logger.error('Error connecting', err);
      throw new Error('Internal server error');
    }
    try {
      const res = await pool.query(
        'select id, config, to_json(start_date) as start_date, to_json(end_date) as end_date from datasets where id=$1',
        [id],
      );
      if (!res || !res.rows || res.rows.length === 0) {
        return null
      }
      return {
        ...res.rows[0].config,
        startDate: res.rows[0].start_date,
        endDate: res.rows[0].end_date,
      };
    } catch (err) {
      logger.error('Error connecting', err);
      throw new Error(err.message);
    } finally {
      if (client) {
        client.release();
      }
    }
  }
  static async getAllDatasetIds() {
    logger.debug('Obtaining datasets');
    let client;
    try {
      client = await pool.connect();
      const res = await pool.query('select id from datasets');
      return res.rows.map((r) => r.id);
    } catch (err) {
      logger.error('Error connecting', err);
      throw new Error('Internal server error');
    } finally {
      if (client) {
        client.release();
      }
    }
  }
}
