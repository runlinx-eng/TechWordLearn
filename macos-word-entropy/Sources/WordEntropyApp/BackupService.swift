import Foundation

struct BackupSnapshot: Codable {
    let exportedAt: String
    let lookupCounts: [WordFrequency]
    let customWords: [String: String]
    let masteredWords: [String]
    let specialMarkedWords: [String]

    init(
        exportedAt: String,
        lookupCounts: [WordFrequency],
        customWords: [String: String],
        masteredWords: [String],
        specialMarkedWords: [String] = []
    ) {
        self.exportedAt = exportedAt
        self.lookupCounts = lookupCounts
        self.customWords = customWords
        self.masteredWords = masteredWords
        self.specialMarkedWords = specialMarkedWords
    }

    enum CodingKeys: String, CodingKey {
        case exportedAt
        case lookupCounts
        case customWords
        case masteredWords
        case specialMarkedWords
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        exportedAt = try container.decode(String.self, forKey: .exportedAt)
        lookupCounts = try container.decode([WordFrequency].self, forKey: .lookupCounts)
        customWords = try container.decode([String: String].self, forKey: .customWords)
        masteredWords = try container.decode([String].self, forKey: .masteredWords)
        specialMarkedWords = try container.decodeIfPresent([String].self, forKey: .specialMarkedWords) ?? []
    }
}

enum BackupServiceError: LocalizedError {
    case backupFileNotFound
    case backupFileReadFailed

    var errorDescription: String? {
        switch self {
        case .backupFileNotFound:
            return "未找到可导入的备份文件"
        case .backupFileReadFailed:
            return "备份文件读取失败"
        }
    }
}

final class BackupService {
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    func exportBackup(snapshot: BackupSnapshot) throws -> URL {
        let folder = try backupDirectory()
        let fileName = "word-entropy-backup-\(timestamp()).json"
        let url = folder.appendingPathComponent(fileName)
        let data = try encoder.encode(snapshot)
        try data.write(to: url, options: .atomic)
        return url
    }

    func loadLatestBackup() throws -> BackupSnapshot {
        let folder = try backupDirectory()
        let files = try FileManager.default.contentsOfDirectory(
            at: folder,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        )
        .filter { $0.pathExtension.lowercased() == "json" }
        .sorted { lhs, rhs in
            let lhsDate = (try? lhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let rhsDate = (try? rhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return lhsDate > rhsDate
        }

        guard let latest = files.first else {
            throw BackupServiceError.backupFileNotFound
        }
        let data = try Data(contentsOf: latest)
        guard !data.isEmpty else {
            throw BackupServiceError.backupFileReadFailed
        }
        return try decoder.decode(BackupSnapshot.self, from: data)
    }

    private func backupDirectory() throws -> URL {
        guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            throw BackupServiceError.backupFileReadFailed
        }
        let folder = documents
            .appendingPathComponent("WordEntropy", isDirectory: true)
            .appendingPathComponent("backups", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    private func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter.string(from: Date())
    }
}
