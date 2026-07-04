import Foundation

public enum VocabularyLoader {
    public static func loadJSON(data: Data) throws -> [String: String] {
        let decoded = try JSONDecoder().decode([String: String].self, from: data)
        var normalized: [String: String] = [:]
        normalized.reserveCapacity(decoded.count)

        for (key, value) in decoded {
            normalized[key.lowercased()] = value
        }
        return normalized
    }
}
