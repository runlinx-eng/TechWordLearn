import Foundation

final class ExportService {
    func exportTopWordsCSV(rows: [WordFrequency], totalLookups: Int) throws -> URL {
        let dir = try exportDirectory()
        let timestamp = Self.timestampString()
        let fileURL = dir.appendingPathComponent("word-entropy-stats-\(timestamp).csv")

        var lines: [String] = []
        lines.append("metric,value")
        lines.append("total_lookups,\(totalLookups)")
        lines.append("")
        lines.append("word,count")
        lines.append(contentsOf: rows.map { "\($0.word),\($0.count)" })

        let csv = lines.joined(separator: "\n")
        try csv.write(to: fileURL, atomically: true, encoding: .utf8)
        return fileURL
    }

    private func exportDirectory() throws -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        guard let root = docs.first else {
            throw ExportError.documentDirectoryUnavailable
        }
        let dir = root
            .appendingPathComponent("WordEntropy", isDirectory: true)
            .appendingPathComponent("exports", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static func timestampString() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter.string(from: Date())
    }
}

enum ExportError: LocalizedError {
    case documentDirectoryUnavailable

    var errorDescription: String? {
        switch self {
        case .documentDirectoryUnavailable:
            return "无法定位 Documents 目录"
        }
    }
}
