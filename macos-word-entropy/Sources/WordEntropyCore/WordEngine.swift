import Foundation

public final class WordEngine {
    private var definitions: [String: String]
    private var masteredWords: Set<String>
    private(set) var lookupCounts: [String: Int]

    public init(definitions: [String: String], masteredWords: Set<String> = [], lookupCounts: [String: Int] = [:]) {
        self.definitions = definitions
        self.masteredWords = masteredWords
        self.lookupCounts = lookupCounts
    }

    public var vocabularySize: Int {
        definitions.count
    }

    @discardableResult
    public func lookup(rawText: String) -> LookupResult? {
        let vocabularyKeys = Set(definitions.keys)
        let tokens = WordNormalizer.extractTokens(rawText)
        for normalized in tokens {
            guard let lemma = WordNormalizer.resolveLemma(for: normalized, vocabularyKeys: vocabularyKeys) else {
                continue
            }
            guard !masteredWords.contains(lemma), let definition = definitions[lemma] else {
                continue
            }

            lookupCounts[lemma, default: 0] += 1
            return LookupResult(lemma: lemma, definition: definition, observedToken: normalized)
        }
        return nil
    }

    public func markMastered(_ lemma: String) {
        masteredWords.insert(lemma.lowercased())
    }

    public func upsertWord(_ word: String, definition: String) {
        definitions[word.lowercased()] = definition
    }

    public func definition(for lemma: String) -> String? {
        definitions[lemma.lowercased()]
    }

    public func hasWord(_ lemma: String) -> Bool {
        definitions[lemma.lowercased()] != nil
    }
}
