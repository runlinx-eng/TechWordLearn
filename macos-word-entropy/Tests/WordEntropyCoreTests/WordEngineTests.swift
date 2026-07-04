import XCTest
@testable import WordEntropyCore

final class WordEngineTests: XCTestCase {
    func testNormalizeTokenExtractsFirstEnglishWord() {
        XCTAssertEqual(WordNormalizer.normalizeToken("  **Variable!"), "variable")
        XCTAssertNil(WordNormalizer.normalizeToken("123"))
    }

    func testExtractTokens() {
        XCTAssertEqual(
            WordNormalizer.extractTokens("123, Parsed algorithms!"),
            ["parsed", "algorithms"]
        )
    }

    func testResolveLemmaWithSuffix() {
        let vocabulary = Set(["parse", "algorithm"])
        XCTAssertEqual(WordNormalizer.resolveLemma(for: "parsed", vocabularyKeys: vocabulary), "parse")
        XCTAssertEqual(WordNormalizer.resolveLemma(for: "algorithms", vocabularyKeys: vocabulary), "algorithm")
    }

    func testLookupMatchesAndCounts() {
        let engine = WordEngine(definitions: ["algorithm": "算法"])

        let result = engine.lookup(rawText: "Algorithms")

        XCTAssertEqual(result?.lemma, "algorithm")
        XCTAssertEqual(engine.lookupCounts["algorithm"], 1)
    }

    func testLookupCanMatchWhenSelectionContainsSentence() {
        let engine = WordEngine(definitions: [
            "entropy": "熵",
            "algorithm": "算法"
        ])

        let result = engine.lookup(rawText: "This is an entropy reduction example.")

        XCTAssertEqual(result?.lemma, "entropy")
        XCTAssertEqual(result?.observedToken, "entropy")
    }

    func testMasteredWordIsFilteredOut() {
        let engine = WordEngine(definitions: ["token": "词元"])
        engine.markMastered("token")

        XCTAssertNil(engine.lookup(rawText: "token"))
    }
}
