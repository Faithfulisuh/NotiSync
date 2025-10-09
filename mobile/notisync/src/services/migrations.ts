import * as SQLite from 'expo-sqlite';

export interface Migration {
  version: number;
  name: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
  down?: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

class MigrationService {
  private static instance: MigrationService;
  private migrations: Migration[] = [];

  private constructor() {
    this.registerMigrations();
  }

  static getInstance(): MigrationService {
    if (!MigrationService.instance) {
      MigrationService.instance = new MigrationService();
    }
    return MigrationService.instance;
  }

  private registerMigrations(): void {
    // Migration 1: Initial schema
    this.migrations.push({
      version: 1,
      name: 'initial_schema',
      up: async (db: SQLite.SQLiteDatabase) => {
        // Users table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);

        // Auth tokens table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS auth_tokens (
            id INTEGER PRIMARY KEY,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          );
        `);

        // Notifications table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            server_id TEXT,
            app_name TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            category TEXT DEFAULT 'Personal',
            priority INTEGER DEFAULT 0,
            timestamp INTEGER NOT NULL,
            package_name TEXT,
            icon TEXT,
            actions TEXT,
            extras TEXT,
            synced INTEGER DEFAULT 0,
            sync_attempts INTEGER DEFAULT 0,
            last_sync_attempt INTEGER,
            is_read INTEGER DEFAULT 0,
            is_dismissed INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);

        // Sync queue table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY,
            notification_id TEXT NOT NULL,
            action TEXT NOT NULL,
            data TEXT NOT NULL,
            attempts INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            last_attempt INTEGER,
            error TEXT,
            FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE
          );
        `);

        // App settings table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);

        // Schema version table
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
          );
        `);

        // Create indexes
        await db.execAsync(`
          CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications (timestamp DESC);
          CREATE INDEX IF NOT EXISTS idx_notifications_synced ON notifications (synced);
          CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications (category);
          CREATE INDEX IF NOT EXISTS idx_sync_queue_attempts ON sync_queue (attempts);
          CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue (created_at);
        `);
      },
    });

    // Migration 2: Add notification rules table
    this.migrations.push({
      version: 2,
      name: 'add_notification_rules',
      up: async (db: SQLite.SQLiteDatabase) => {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS notification_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            rule_type TEXT NOT NULL,
            conditions TEXT NOT NULL,
            actions TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            priority INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);

        await db.execAsync(`
          CREATE INDEX IF NOT EXISTS idx_notification_rules_active ON notification_rules (is_active);
          CREATE INDEX IF NOT EXISTS idx_notification_rules_priority ON notification_rules (priority DESC);
        `);
      },
      down: async (db: SQLite.SQLiteDatabase) => {
        await db.execAsync('DROP TABLE IF EXISTS notification_rules;');
      },
    });

    // Migration 3: Add device info table
    this.migrations.push({
      version: 3,
      name: 'add_device_info',
      up: async (db: SQLite.SQLiteDatabase) => {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS device_info (
            id TEXT PRIMARY KEY,
            device_name TEXT NOT NULL,
            platform TEXT NOT NULL,
            model TEXT,
            os_version TEXT,
            app_version TEXT,
            push_token TEXT,
            is_registered INTEGER DEFAULT 0,
            last_sync INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);
      },
      down: async (db: SQLite.SQLiteDatabase) => {
        await db.execAsync('DROP TABLE IF EXISTS device_info;');
      },
    });

    // Migration 4: Add notification analytics table
    this.migrations.push({
      version: 4,
      name: 'add_notification_analytics',
      up: async (db: SQLite.SQLiteDatabase) => {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS notification_analytics (
            id TEXT PRIMARY KEY,
            notification_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            event_data TEXT,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE
          );
        `);

        await db.execAsync(`
          CREATE INDEX IF NOT EXISTS idx_analytics_notification_id ON notification_analytics (notification_id);
          CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON notification_analytics (event_type);
          CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON notification_analytics (timestamp DESC);
        `);
      },
      down: async (db: SQLite.SQLiteDatabase) => {
        await db.execAsync('DROP TABLE IF EXISTS notification_analytics;');
      },
    });
  }

  async runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
    try {
      // Get current schema version
      const currentVersion = await this.getCurrentVersion(db);
      console.log(`Current database version: ${currentVersion}`);

      // Find migrations to run
      const migrationsToRun = this.migrations.filter(m => m.version > currentVersion);
      
      if (migrationsToRun.length === 0) {
        console.log('Database is up to date');
        return;
      }

      console.log(`Running ${migrationsToRun.length} migrations...`);

      // Run migrations in order
      for (const migration of migrationsToRun) {
        console.log(`Running migration ${migration.version}: ${migration.name}`);
        
        try {
          await migration.up(db);
          await this.setVersion(db, migration.version);
          console.log(`Migration ${migration.version} completed successfully`);
        } catch (error) {
          console.error(`Migration ${migration.version} failed:`, error);
          throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${error}`);
        }
      }

      console.log('All migrations completed successfully');
    } catch (error) {
      console.error('Migration process failed:', error);
      throw error;
    }
  }

  async rollbackMigration(db: SQLite.SQLiteDatabase, targetVersion: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion(db);
    
    if (targetVersion >= currentVersion) {
      throw new Error('Target version must be lower than current version');
    }

    const migrationsToRollback = this.migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version); // Rollback in reverse order

    for (const migration of migrationsToRollback) {
      if (!migration.down) {
        throw new Error(`Migration ${migration.version} does not support rollback`);
      }

      console.log(`Rolling back migration ${migration.version}: ${migration.name}`);
      
      try {
        await migration.down(db);
        await this.setVersion(db, migration.version - 1);
        console.log(`Migration ${migration.version} rolled back successfully`);
      } catch (error) {
        console.error(`Rollback of migration ${migration.version} failed:`, error);
        throw error;
      }
    }
  }

  private async getCurrentVersion(db: SQLite.SQLiteDatabase): Promise<number> {
    try {
      const result = await db.getFirstAsync<{ version: number }>(
        'SELECT MAX(version) as version FROM schema_version'
      );
      return result?.version || 0;
    } catch (error) {
      // Table doesn't exist yet, return 0
      return 0;
    }
  }

  private async setVersion(db: SQLite.SQLiteDatabase, version: number): Promise<void> {
    await db.runAsync(
      'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)',
      [version, Date.now()]
    );
  }

  async getMigrationHistory(db: SQLite.SQLiteDatabase): Promise<Array<{ version: number; appliedAt: Date }>> {
    try {
      const results = await db.getAllAsync<{ version: number; applied_at: number }>(
        'SELECT version, applied_at FROM schema_version ORDER BY version ASC'
      );

      return results.map(row => ({
        version: row.version,
        appliedAt: new Date(row.applied_at),
      }));
    } catch (error) {
      return [];
    }
  }

  getAvailableMigrations(): Array<{ version: number; name: string }> {
    return this.migrations.map(m => ({
      version: m.version,
      name: m.name,
    }));
  }

  async resetDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
    console.warn('Resetting database - all data will be lost!');
    
    // Drop all tables
    const tables = [
      'notification_analytics',
      'device_info', 
      'notification_rules',
      'sync_queue',
      'notifications',
      'auth_tokens',
      'users',
      'app_settings',
      'schema_version'
    ];

    for (const table of tables) {
      try {
        await db.execAsync(`DROP TABLE IF EXISTS ${table};`);
      } catch (error) {
        console.warn(`Failed to drop table ${table}:`, error);
      }
    }

    // Run all migrations from scratch
    await this.runMigrations(db);
  }
}

export const migrationService = MigrationService.getInstance();