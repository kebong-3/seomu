import sqlite3
from contextlib import contextmanager


class Database:
    def __init__(self, path):
        self.path = str(path)
        with self.connect() as c:
            c.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
                hash TEXT NOT NULL, version INTEGER NOT NULL, size INTEGER NOT NULL,
                stored_path TEXT NOT NULL, status TEXT NOT NULL, engine TEXT NOT NULL DEFAULT '',
                warnings TEXT NOT NULL DEFAULT '[]', block_count INTEGER NOT NULL DEFAULT 0,
                char_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS blocks (
                id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                ordinal INTEGER NOT NULL, locator TEXT NOT NULL, kind TEXT NOT NULL,
                text TEXT NOT NULL, cells TEXT NOT NULL DEFAULT '[]');
            CREATE INDEX IF NOT EXISTS blocks_document ON blocks(document_id);
            CREATE TABLE IF NOT EXISTS vectors (
                block_id TEXT PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE,
                model TEXT NOT NULL, vector TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, state TEXT NOT NULL, total INTEGER NOT NULL,
                done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS job_items (
                id INTEGER PRIMARY KEY, job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
                path TEXT NOT NULL, staged_path TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
                message TEXT NOT NULL DEFAULT '', document_id TEXT);
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, deadline TEXT NOT NULL DEFAULT '',
                owner TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'todo',
                source_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
                source_version INTEGER, source_locator TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
            ''')

    @contextmanager
    def connect(self):
        c = sqlite3.connect(self.path, timeout=30)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    def rows(self, sql, params=()):
        with self.connect() as c:
            return [dict(r) for r in c.execute(sql, params).fetchall()]
