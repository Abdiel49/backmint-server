import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { databaseConfig } from '../config/configuration.js';

await ConfigModule.forRoot({
  cache: true,
  load: [databaseConfig],
});

const database = databaseConfig();

const dataSource = new DataSource({
  type: 'postgres',
  host: database.host,
  port: database.port,
  username: database.username,
  password: database.password,
  database: database.name,
  synchronize: false,
  migrationsRun: false,
  migrationsTransactionMode: 'all',
  migrations: [`${import.meta.dirname}/migrations/*{.ts,.js}`],
});

export default dataSource;
