import Foundation

public enum WordNormalizer {
    private static let tokenPattern = "[A-Za-z][A-Za-z'-]*"
    private static let suffixes = ["ing", "ed", "es", "s", "d", "ly"]

    public static func extractTokens(_ raw: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: tokenPattern) else {
            return []
        }
        let nsRange = NSRange(raw.startIndex..<raw.endIndex, in: raw)
        return regex.matches(in: raw, options: [], range: nsRange).compactMap { match in
            guard let range = Range(match.range, in: raw) else {
                return nil
            }
            return String(raw[range]).lowercased()
        }
    }

    public static func normalizeToken(_ raw: String) -> String? {
        extractTokens(raw).first
    }

    public static func resolveLemma(for normalizedToken: String, vocabularyKeys: Set<String>) -> String? {
        if vocabularyKeys.contains(normalizedToken) {
            return normalizedToken
        }

        for suffix in suffixes {
            guard normalizedToken.hasSuffix(suffix) else {
                continue
            }
            let candidate = String(normalizedToken.dropLast(suffix.count))
            if vocabularyKeys.contains(candidate) {
                return candidate
            }
        }
        return nil
    }
}
