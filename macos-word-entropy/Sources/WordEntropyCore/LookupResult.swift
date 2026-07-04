import Foundation

public struct LookupResult: Equatable {
    public let lemma: String
    public let definition: String
    public let observedToken: String

    public init(lemma: String, definition: String, observedToken: String) {
        self.lemma = lemma
        self.definition = definition
        self.observedToken = observedToken
    }
}
