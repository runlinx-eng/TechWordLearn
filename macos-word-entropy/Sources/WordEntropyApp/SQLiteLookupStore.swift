import Foundation
import SQLite3

struct WordFrequency: Identifiable, Codable {
    let word: String
    let count: Int

    var id: String { word }
}

struct SourceFrequency: Identifiable {
    let source: String
    let count: Int

    var id: String { source }
}

struct LookupEventRow: Identifiable {
    let id: Int
    let word: String
    let observedToken: String
    let source: String
    let appBundleID: String
    let appName: String
    let createdAt: String
}

final class SQLiteLookupStore {
    private var db: OpaquePointer?

    init(databaseURL: URL) throws {
        try Self.ensureParentDirectory(for: databaseURL)
        try openDatabase(at: databaseURL)
        try migrate()
    }

    deinit {
        if db != nil {
            sqlite3_close(db)
        }
    }

    func recordLookup(
        lemma: String,
        observedToken: String,
        source: String = "manual",
        appBundleID: String = "",
        appName: String = ""
    ) throws {
        let now = ISO8601DateFormatter().string(from: Date())

        let countSQL = """
        INSERT INTO lookup_counts(word, count, updated_at)
        VALUES(?, 1, ?)
        ON CONFLICT(word) DO UPDATE SET
            count = count + 1,
            updated_at = excluded.updated_at;
        """
        try executePrepared(sql: countSQL, bindings: [
            .text(lemma),
            .text(now),
        ])

        let eventSQL = """
        INSERT INTO lookup_events(word, observed_token, source, app_bundle_id, app_name, created_at)
        VALUES(?, ?, ?, ?, ?, ?);
        """
        try executePrepared(sql: eventSQL, bindings: [
            .text(lemma),
            .text(observedToken),
            .text(source),
            .text(appBundleID),
            .text(appName),
            .text(now),
        ])
    }

    func totalLookupCount() throws -> Int {
        let sql = "SELECT COALESCE(SUM(count), 0) FROM lookup_counts;"
        return try querySingleInt(sql: sql)
    }

    func lookupCount(word: String) throws -> Int {
        let sql = """
        SELECT COALESCE(count, 0)
        FROM lookup_counts
        WHERE word = ?;
        """
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }
        guard sqlite3_bind_text(stmt, 1, word, -1, SQLITE_TRANSIENT) == SQLITE_OK else {
            throw SQLiteStoreError.bindFailed(sqlite3ErrorMessage(db))
        }

        if sqlite3_step(stmt) == SQLITE_ROW {
            return Int(sqlite3_column_int(stmt, 0))
        }
        return 0
    }

    func topWords(limit: Int) throws -> [WordFrequency] {
        let sql = """
        SELECT word, count
        FROM lookup_counts
        ORDER BY count DESC, word ASC
        LIMIT ?;
        """
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }

        guard sqlite3_bind_int(stmt, 1, Int32(limit)) == SQLITE_OK else {
            throw SQLiteStoreError.bindFailed(sqlite3ErrorMessage(db))
        }

        var rows: [WordFrequency] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let wordPtr = sqlite3_column_text(stmt, 0) else {
                continue
            }
            let word = String(cString: wordPtr)
            let count = Int(sqlite3_column_int(stmt, 1))
            rows.append(WordFrequency(word: word, count: count))
        }
        return rows
    }

    func topWordsByRecent(limit: Int) throws -> [WordFrequency] {
        let sql = """
        SELECT c.word, c.count
        FROM lookup_counts c
        LEFT JOIN lookup_events e ON e.word = c.word
        GROUP BY c.word, c.count
        ORDER BY MAX(e.created_at) DESC, c.count DESC, c.word ASC
        LIMIT ?;
        """
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }

        guard sqlite3_bind_int(stmt, 1, Int32(limit)) == SQLITE_OK else {
            throw SQLiteStoreError.bindFailed(sqlite3ErrorMessage(db))
        }

        var rows: [WordFrequency] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let wordPtr = sqlite3_column_text(stmt, 0) else {
                continue
            }
            let word = String(cString: wordPtr)
            let count = Int(sqlite3_column_int(stmt, 1))
            rows.append(WordFrequency(word: word, count: count))
        }
        return rows
    }

    func allLookupCounts() throws -> [WordFrequency] {
        let sql = """
        SELECT word, count
        FROM lookup_counts
        ORDER BY word ASC;
        """
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }

        var rows: [WordFrequency] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let wordPtr = sqlite3_column_text(stmt, 0) else {
                continue
            }
            let word = String(cString: wordPtr)
            let count = Int(sqlite3_column_int(stmt, 1))
            rows.append(WordFrequency(word: word, count: count))
        }
        return rows
    }

    func sourceFrequencies(limit: Int = 6) throws -> [SourceFrequency] {
        let sql = """
        SELECT source, COUNT(1) AS c
        FROM lookup_events
        GROUP BY source
        ORDER BY c DESC, source ASC
        LIMIT ?;
        """
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }
        guard sqlite3_bind_int(stmt, 1, Int32(limit)) == SQLITE_OK else {
            throw SQLiteStoreError.bindFailed(sqlite3ErrorMessage(db))
        }

        var rows: [SourceFrequency] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let sourcePtr = sqlite3_column_text(stmt, 0) else {
                continue
            }
            rows.append(SourceFrequency(
                source: String(cString: sourcePtr),
                count: Int(sqlite3_column_int(stmt, 1))
            ))
        }
        return rows
    }

    func lookupEventCount(source: String) throws -> Int {
        let sql = """
        SELECT COUNT(1)
        FROM lookup_events
        WHERE source = ?;
        """
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }
        guard sqlite3_bind_text(stmt, 1, source, -1, SQLITE_TRANSIENT) == SQLITE_OK else {
            throw SQLiteStoreError.bindFailed(sqlite3ErrorMessage(db))
        }
        guard sqlite3_step(stmt) == SQLITE_ROW else {
            throw SQLiteStoreError.queryFailed(sqlite3ErrorMessage(db))
        }
        return Int(sqlite3_column_int(stmt, 0))
    }

    func latestLookupEventCreatedAt(source: String) throws -> String? {
        let sql = """
        SELECT created_at
        FROM lookup_events
        WHERE source = ?
        ORDER BY id DESC
        LIMIT 1;
        """
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }
        guard sqlite3_bind_text(stmt, 1, source, -1, SQLITE_TRANSIENT) == SQLITE_OK else {
            throw SQLiteStoreError.bindFailed(sqlite3ErrorMessage(db))
        }
        guard sqlite3_step(stmt) == SQLITE_ROW else {
            return nil
        }
        guard let value = sqlite3_column_text(stmt, 0) else {
            return nil
        }
        return String(cString: value)
    }

    func recentLookupEvents(limit: Int = 8) throws -> [LookupEventRow] {
        let sql = """
        SELECT id, word, observed_token, source, app_bundle_id, app_name, created_at
        FROM lookup_events
        ORDER BY id DESC
        LIMIT ?;
        """
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }
        guard sqlite3_bind_int(stmt, 1, Int32(limit)) == SQLITE_OK else {
            throw SQLiteStoreError.bindFailed(sqlite3ErrorMessage(db))
        }

        var rows: [LookupEventRow] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let wordPtr = sqlite3_column_text(stmt, 1),
                  let tokenPtr = sqlite3_column_text(stmt, 2),
                  let sourcePtr = sqlite3_column_text(stmt, 3),
                  let bundlePtr = sqlite3_column_text(stmt, 4),
                  let appNamePtr = sqlite3_column_text(stmt, 5),
                  let createdPtr = sqlite3_column_text(stmt, 6) else {
                continue
            }
            rows.append(LookupEventRow(
                id: Int(sqlite3_column_int(stmt, 0)),
                word: String(cString: wordPtr),
                observedToken: String(cString: tokenPtr),
                source: String(cString: sourcePtr),
                appBundleID: String(cString: bundlePtr),
                appName: String(cString: appNamePtr),
                createdAt: String(cString: createdPtr)
            ))
        }
        return rows
    }

    func loadCustomVocabulary() throws -> [String: String] {
        let sql = "SELECT word, definition FROM custom_words;"
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }

        var out: [String: String] = [:]
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let wordPtr = sqlite3_column_text(stmt, 0),
                  let defPtr = sqlite3_column_text(stmt, 1) else {
                continue
            }
            out[String(cString: wordPtr)] = String(cString: defPtr)
        }
        return out
    }

    func loadMasteredWords() throws -> Set<String> {
        let sql = "SELECT word FROM mastered_words;"
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }

        var out = Set<String>()
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let wordPtr = sqlite3_column_text(stmt, 0) else {
                continue
            }
            out.insert(String(cString: wordPtr))
        }
        return out
    }

    func loadSpecialMarkedWords() throws -> Set<String> {
        let sql = "SELECT word FROM special_marked_words;"
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }

        var out = Set<String>()
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let wordPtr = sqlite3_column_text(stmt, 0) else {
                continue
            }
            out.insert(String(cString: wordPtr))
        }
        return out
    }

    func upsertCustomWord(word: String, definition: String) throws {
        let now = ISO8601DateFormatter().string(from: Date())
        let sql = """
        INSERT INTO custom_words(word, definition, updated_at)
        VALUES(?, ?, ?)
        ON CONFLICT(word) DO UPDATE SET
            definition = excluded.definition,
            updated_at = excluded.updated_at;
        """
        try executePrepared(sql: sql, bindings: [
            .text(word),
            .text(definition),
            .text(now),
        ])
    }

    func setMastered(word: String, mastered: Bool) throws {
        if mastered {
            let now = ISO8601DateFormatter().string(from: Date())
            let insertSQL = """
            INSERT INTO mastered_words(word, updated_at)
            VALUES(?, ?)
            ON CONFLICT(word) DO UPDATE SET
                updated_at = excluded.updated_at;
            """
            try executePrepared(sql: insertSQL, bindings: [
                .text(word),
                .text(now),
            ])
        } else {
            let deleteSQL = "DELETE FROM mastered_words WHERE word = ?;"
            try executePrepared(sql: deleteSQL, bindings: [.text(word)])
        }
    }

    func setSpecialMarked(word: String, marked: Bool) throws {
        if marked {
            let now = ISO8601DateFormatter().string(from: Date())
            let insertSQL = """
            INSERT INTO special_marked_words(word, updated_at)
            VALUES(?, ?)
            ON CONFLICT(word) DO UPDATE SET
                updated_at = excluded.updated_at;
            """
            try executePrepared(sql: insertSQL, bindings: [
                .text(word),
                .text(now),
            ])
        } else {
            let deleteSQL = "DELETE FROM special_marked_words WHERE word = ?;"
            try executePrepared(sql: deleteSQL, bindings: [.text(word)])
        }
    }

    func mergeLookupCounts(_ rows: [WordFrequency]) throws {
        guard !rows.isEmpty else {
            return
        }
        let now = ISO8601DateFormatter().string(from: Date())
        let sql = """
        INSERT INTO lookup_counts(word, count, updated_at)
        VALUES(?, ?, ?)
        ON CONFLICT(word) DO UPDATE SET
            count = count + excluded.count,
            updated_at = excluded.updated_at;
        """
        for row in rows where row.count > 0 {
            try executePrepared(sql: sql, bindings: [
                .text(row.word),
                .integer(row.count),
                .text(now),
            ])
        }
    }

    func mergeCustomVocabulary(_ customWords: [String: String]) throws {
        for (word, definition) in customWords {
            try upsertCustomWord(word: word, definition: definition)
        }
    }

    func mergeMasteredWords(_ masteredWords: Set<String>) throws {
        for word in masteredWords {
            try setMastered(word: word, mastered: true)
        }
    }

    func mergeSpecialMarkedWords(_ specialMarkedWords: Set<String>) throws {
        for word in specialMarkedWords {
            try setSpecialMarked(word: word, marked: true)
        }
    }

    private func openDatabase(at url: URL) throws {
        if sqlite3_open(url.path, &db) != SQLITE_OK {
            defer { sqlite3_close(db) }
            throw SQLiteStoreError.openFailed(sqlite3ErrorMessage(db))
        }
    }

    private func migrate() throws {
        let createCountsSQL = """
        CREATE TABLE IF NOT EXISTS lookup_counts(
            word TEXT PRIMARY KEY,
            count INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        );
        """

        let createEventsSQL = """
        CREATE TABLE IF NOT EXISTS lookup_events(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            observed_token TEXT NOT NULL,
            source TEXT NOT NULL,
            app_bundle_id TEXT NOT NULL DEFAULT '',
            app_name TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        """

        let createCustomSQL = """
        CREATE TABLE IF NOT EXISTS custom_words(
            word TEXT PRIMARY KEY,
            definition TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """

        let createMasteredSQL = """
        CREATE TABLE IF NOT EXISTS mastered_words(
            word TEXT PRIMARY KEY,
            updated_at TEXT NOT NULL
        );
        """

        let createSpecialMarkedSQL = """
        CREATE TABLE IF NOT EXISTS special_marked_words(
            word TEXT PRIMARY KEY,
            updated_at TEXT NOT NULL
        );
        """

        try execute(sql: createCountsSQL)
        try execute(sql: createEventsSQL)
        try execute(sql: createCustomSQL)
        try execute(sql: createMasteredSQL)
        try execute(sql: createSpecialMarkedSQL)
        try ensureLookupEventsColumns()
    }

    private func ensureLookupEventsColumns() throws {
        try ensureColumnExists(
            table: "lookup_events",
            column: "app_bundle_id",
            definition: "TEXT NOT NULL DEFAULT ''"
        )
        try ensureColumnExists(
            table: "lookup_events",
            column: "app_name",
            definition: "TEXT NOT NULL DEFAULT ''"
        )
    }

    private func ensureColumnExists(table: String, column: String, definition: String) throws {
        if try tableHasColumn(table: table, column: column) {
            return
        }
        try execute(sql: "ALTER TABLE \(table) ADD COLUMN \(column) \(definition);")
    }

    private func tableHasColumn(table: String, column: String) throws -> Bool {
        let sql = "PRAGMA table_info(\(table));"
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }

        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let namePtr = sqlite3_column_text(stmt, 1) else {
                continue
            }
            if String(cString: namePtr) == column {
                return true
            }
        }
        return false
    }

    private func execute(sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else {
            throw SQLiteStoreError.executionFailed(sqlite3ErrorMessage(db))
        }
    }

    private func querySingleInt(sql: String) throws -> Int {
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }

        guard sqlite3_step(stmt) == SQLITE_ROW else {
            throw SQLiteStoreError.queryFailed(sqlite3ErrorMessage(db))
        }

        return Int(sqlite3_column_int(stmt, 0))
    }

    private func executePrepared(sql: String, bindings: [SQLiteBinding]) throws {
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw SQLiteStoreError.prepareFailed(sqlite3ErrorMessage(db))
        }

        for (index, binding) in bindings.enumerated() {
            let column = Int32(index + 1)
            switch binding {
            case .text(let value):
                guard sqlite3_bind_text(stmt, column, value, -1, SQLITE_TRANSIENT) == SQLITE_OK else {
                    throw SQLiteStoreError.bindFailed(sqlite3ErrorMessage(db))
                }
            case .integer(let value):
                guard sqlite3_bind_int64(stmt, column, sqlite3_int64(value)) == SQLITE_OK else {
                    throw SQLiteStoreError.bindFailed(sqlite3ErrorMessage(db))
                }
            }
        }

        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw SQLiteStoreError.executionFailed(sqlite3ErrorMessage(db))
        }
    }

    private static func ensureParentDirectory(for url: URL) throws {
        let parent = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
    }

    private func sqlite3ErrorMessage(_ db: OpaquePointer?) -> String {
        guard let msg = sqlite3_errmsg(db) else {
            return "Unknown SQLite error"
        }
        return String(cString: msg)
    }
}

enum SQLiteBinding {
    case text(String)
    case integer(Int)
}

enum SQLiteStoreError: LocalizedError {
    case openFailed(String)
    case prepareFailed(String)
    case bindFailed(String)
    case executionFailed(String)
    case queryFailed(String)

    var errorDescription: String? {
        switch self {
        case .openFailed(let message):
            return "打开数据库失败: \(message)"
        case .prepareFailed(let message):
            return "SQL 预编译失败: \(message)"
        case .bindFailed(let message):
            return "SQL 绑定参数失败: \(message)"
        case .executionFailed(let message):
            return "SQL 执行失败: \(message)"
        case .queryFailed(let message):
            return "SQL 查询失败: \(message)"
        }
    }
}

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
